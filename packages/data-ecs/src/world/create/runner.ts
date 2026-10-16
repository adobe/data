import type { Leaf } from '../../system/leaf.js';
import type { Archetype } from './archetype.js';
import { kernelOf } from './attach-kernel.js';
import { readCell } from './cells.js';
import { createCommands } from './commands.js';
import { bindKernel, type BoundKernel } from './kernels.js';
import type { Pool } from './pool.js';
import { maximumScalars, type KernelSetup } from './protocol.js';
import { createBuffer, createKernelCommands, emptyBuffer, type CommandBuffer } from './buffer.js';
import { reserve } from './entities.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import { resourceCell } from './resources.js';
import { createContext, rowBinder } from './rows.js';
import { scalarValues } from './wasm.js';
import { idOf, type State } from './state.js';
import { accessorsOf } from '../../gpu/accessors.js';
import { recordWords } from './gpu.js';
import { maximumWorkgroups, workgroupSize, type WgslKernel } from './wgsl.js';
import { allocateArray, freeArray } from './arrays.js';
import { combine, identityOf, reductionTargets, type ReductionTarget } from './reductions.js';
import { samePath, type TypedArray } from '../../layout/layout.js';
import { inputFor } from './input.js';
import { createUp } from './up.js';

/** One unit of a system's work for a run: the commands it issued, plus its error if it failed partway. */
export type ChunkResult = { readonly commands: CommandBuffer; readonly error?: unknown };
export type Chunk = ChunkResult | Promise<ChunkResult>;

/**
 * Where kernels may run. Archetypes with fewer than `minimumChunk` rows run on the main thread.
 * `next` rotates the first worker of each split, so small archetypes don't all queue on one worker.
 */
export type Workers = { readonly pool: Pool; readonly minimumChunk: number; next: number };

/** 16 rows of f32 is a 64-byte line, so chunks of different workers never share one. */
const chunkAlignment = 16;
/** Pieces per worker in a claimed split: enough that faster workers can take more of them. */
const claimsPerWorker = 8;

const noPartials = new Float64Array(0);

/**
 * Runs one leaf system. Each run takes a new tick, which becomes the system's `lastRun`.
 * `start` does main-thread work immediately and posts kernel chunks to workers; the chunks' commands merge in returned order.
 */
export type Runner = {
    readonly kernel: BoundKernel | null;
    /** Where it runs: the CPU, the GPU as a placed kernel, or the GPU as a render system recording its own work. */
    readonly placement: "cpu" | "gpu" | "render";
    /** Component ids it reads or writes in its query, those it writes, and those its lookups read in any archetype. */
    readonly touches: readonly number[];
    readonly writes: readonly number[];
    readonly looks: readonly number[];
    /** The archetypes its query matches now. */
    readonly matched: () => readonly Archetype[];
    /** Loads its kernel, and compiles its compute pipeline when it's placed on the GPU; rejects with the reason it can't be. */
    readonly load: () => Promise<void>;
    /** What workers need to load this system's kernel, given its index. */
    readonly setup: (index: number) => KernelSetup | null;
    readonly start: (args: unknown, workers: Workers | null, index: number) => readonly Chunk[];
    /** The resources it reduces into, in the order `finish` gives their folds. */
    readonly targets: readonly ReductionTarget[];
    /**
     * Once a run's chunks settle: the leaves of its fold into each target, or null when it failed or skipped its rows,
     * so it contributes nothing.
     */
    readonly finish: (failed: boolean) => readonly Float64Array[] | null;
    /** For the registrar to call after each sync point once the runner is registered: sizes its reduction partials. */
    readonly afterSync: (() => void) | null;
};

/** Throws if the leaf is a kernel that wasn't compiled or doesn't match its schemas. */
export const createRunner = (state: State, leaf: Leaf): Runner => {
    const { declaration } = leaf;
    // Method parameters are bivariant, so the runtime can see any leaf's body with erased parameter types.
    const system: { body(subject: unknown, context?: unknown): void } = leaf;
    const { components: query, resources } = declaration;
    const required = [...new Set([...query?.read ?? [], ...query?.write ?? [], ...query?.has ?? [], ...query?.added ?? [], ...query?.changed ?? []])].map(key => idOf(state, key));
    const excluded = (query?.not ?? []).map(key => idOf(state, key));
    const addedIds = (query?.added ?? []).map(key => idOf(state, key));
    const changedIds = (query?.changed ?? []).map(key => idOf(state, key));
    const resourceChanged = resources?.changed ?? [];
    const filtered = addedIds.length + changedIds.length + resourceChanged.length > 0;
    let kernel: BoundKernel | null = null;
    if (declaration.kernel !== undefined) {
        const description = kernelOf(leaf);
        if (description === undefined) throw new Error(`System "${declaration.name}" is a kernel but wasn't compiled; add kernelPlugin() to the Vite config.`);
        kernel = bindKernel(state, leaf, description);
    }
    const placement = leaf.kind === "render" ? "render" : declaration.kernel === "gpu" && state.gpu !== null ? "gpu" : "cpu";
    const failPlacement = (message: string): never => { throw new Error(`System "${declaration.name}" ${message}.`); };
    // The build rejects these in compiled kernels; this covers declarations it didn't see.
    if (declaration.kernel === "gpu") {
        if (filtered) failPlacement("can't run on the GPU: GPU kernels don't support change filters yet");
        if (declaration.lookup !== undefined && Object.keys(declaration.lookup).length > 0) failPlacement("can't run on the GPU: GPU kernels don't support lookups yet");
        if (declaration.up !== undefined) failPlacement("can't run on the GPU: GPU kernels don't support up yet");
    }
    if (declaration.up !== undefined && query === undefined) failPlacement("uses up, which orders rows, without components");
    const up = declaration.up === undefined ? null : createUp(state, declaration.up);
    const targets = reductionTargets(state, declaration);
    if (targets.length > 0) {
        if (declaration.kernel === "gpu") failPlacement("can't run on the GPU: GPU kernels don't support reductions yet");
        if (leaf.kind === "render") failPlacement("can't reduce: a render system records GPU work rather than running rows");
    }
    /** For each partial of the kernel, the target and leaf it folds into. */
    const partialLeaves = (kernel?.description.reductions ?? []).map(reduced => {
        const index = targets.findIndex(target => target.key === reduced.resource);
        const target = targets[index];
        if (target === undefined || target.operator !== reduced.operator) {
            return failPlacement(`reduces "${String(reduced.resource)}" with "${reduced.operator}", which its reduce doesn't declare`);
        }
        const leaf = target.leaves.findIndex(candidate => samePath(candidate.path, reduced.path));
        if (leaf < 0) return failPlacement(`contributes to "${String(reduced.resource)}" at [${reduced.path.join(", ")}], which isn't a scalar of its value; destructure tuples and structs or build them`);
        return { target: index, leaf };
    });
    for (const shape of kernel?.description.reducedShapes ?? []) {
        const target = targets.find(candidate => candidate.key === shape.component);
        const exact = target !== undefined && target.leaves.length === shape.leaves.length && target.leaves.every(leaf => shape.leaves.some(path => samePath(path, leaf.path)));
        if (!exact) failPlacement(`contributes a value to "${String(shape.component)}" that doesn't match its schema`);
    }
    const accessors = declaration.shader === undefined ? [] : accessorsOf(declaration.shader);
    if (typeof accessors === "string") return failPlacement(`can't render: ${accessors}`);
    const touches = [...new Set([...query?.read ?? [], ...query?.write ?? []])].map(key => idOf(state, key));
    const writes = (query?.write ?? []).map(key => idOf(state, key));
    const looks = [...new Set([...Object.values(declaration.lookup ?? {}).flatMap(lookup => lookup.read ?? []), ...declaration.up?.read ?? []])].map(key => idOf(state, key));
    if ((declaration.shader !== undefined) !== (leaf.kind === "render")) failPlacement("has a shader only when System.render makes it");
    /** Record keys by archetype. */
    const keys = new Map<Archetype, string>();
    const keyOf = (archetype: Archetype): string => {
        let key = keys.get(archetype);
        if (key === undefined) keys.set(archetype, key = `${declaration.name}:${archetype.id}`);
        return key;
    };
    let pipeline: { readonly compute: GPUComputePipeline; readonly kernel: WgslKernel } | null = null;
    const holder: { buffer: CommandBuffer } = { buffer: createBuffer() };
    /** This system's buffers, reused each run: the sync point clears them. */
    const owned: CommandBuffer[] = [];
    let used = 0;
    const nextBuffer = (): CommandBuffer => owned[used++] ??= createBuffer();
    const commands = createCommands(state, holder);
    const kernelCommands = createKernelCommands(holder, kernel?.setup.keys ?? [], () => reserve(state.entities));
    // A kernel's reductions fold in its partials, so only a body that runs as written gets reducer functions. Render
    // bodies and GPU kernels issue no commands.
    const ownInput = inputFor(leaf);
    const context = createContext(state, declaration, {
        targets: kernel === null ? targets : [],
        commands: leaf.kind === "render" || declaration.kernel === "gpu" ? undefined : commands,
        input: declaration.input !== undefined,
    });
    /** Partials of the kernel's reductions, one slot per kernel call of a run, in the order its rows run. */
    const partialCount = partialLeaves.length;
    let slots = noPartials;
    let slotsUsed = 0;
    /** Whether the current run ran its rows, so its reductions are written. */
    let ran = false;
    /**
     * The most kernel calls a run gives an archetype: one on the main thread; across workers a piece of at least
     * `chunkAlignment` rows each, at most `claimsPerWorker` per worker.
     */
    const slotsFor = (count: number): number =>
        count === 0 ? 0 : state.workers > 0 ? Math.min(state.workers * claimsPerWorker, Math.ceil(count / chunkAlignment)) : 1;
    /** Sized when archetypes change, at registration and sync points, so runs don't allocate or grow memory. */
    const sizeSlots = (): void => {
        if (partialCount === 0) return;
        refreshMatches();
        let needed = 0;
        for (const archetype of matches) needed += slotsFor(archetype.count);
        needed = Math.max(1, needed) * partialCount;
        if (slots.length >= needed) return;
        if (slots.length > 0) freeArray(state.memory, slots);
        slots = allocateArray(state.memory, Float64Array, Math.max(needed, 2 * slots.length));
    };
    /** The first of `count` slots for the next kernel calls, each starting at its operators' identities. */
    const takeSlots = (count: number): number => {
        const first = slotsUsed;
        slotsUsed += count;
        // Archetypes change only at sync points, which size the slots for them.
        if (slotsUsed * partialCount > slots.length) throw new Error(`System "${declaration.name}" has no room for its reduction partials.`);
        for (let slot = first; slot < slotsUsed; slot++) {
            partialLeaves.forEach(({ target }, k) => { slots[slot * partialCount + k] = identityOf(targets[target]?.operator ?? "+"); });
        }
        return first;
    };
    /** Each target's leaves, folded from the partials in `finish`. */
    const folded = targets.map(target => new Float64Array(target.leaves.length));
    const partialAddress = (slot: number): number => partialCount === 0 ? -1 : slots.byteOffset + slot * partialCount * 8;
    const matches: Archetype[] = [];
    let checked = 0;
    const bindRow = rowBinder(state, query?.read ?? [], query?.write ?? []);
    let lastRun = 0;

    function refreshMatches(): void {
        for (; checked < state.archetypes.length; checked++) {
            const archetype = state.archetypes[checked];
            if (!archetype.resource && required.every(id => archetype.storageOf.has(id)) && !excluded.some(id => archetype.storageOf.has(id))) matches.push(archetype);
        }
    }

    /** Every row of an archetype passes when a `changed` component's whole column changed since `since`. */
    const sinceFor = (archetype: Archetype, since: number): number => {
        if (since < 0) return since;
        for (const id of changedIds) if ((archetype.storageById[id]?.columnChanged ?? 0) > since) return -1;
        return since;
    };

    /** The archetype's change filters: `added` then `changed`, rows and chunks. */
    const filtersOf = (archetype: Archetype): Filter[] => [
        ...addedIds.flatMap(id => {
            const storage = archetype.storageById[id];
            return storage === undefined ? [] : [{ ticks: storage.added, chunks: storage.chunkAdded }];
        }),
        ...changedIds.flatMap(id => {
            const storage = archetype.storageById[id];
            return storage === undefined ? [] : [{ ticks: storage.changed, chunks: storage.chunkChanged }];
        }),
    ];

    const runBody = (archetype: Archetype, since: number): void => {
        const row = bindRow(archetype);
        const { value } = row;
        const values = context.value;
        forEachPassingRange(filtersOf(archetype), since, 0, archetype.count, (start, end) => {
            for (let index = start; index < end; index++) {
                row.index = index;
                system.body(value, values);
            }
        });
    };

    /** The kernel applies the change filters itself, chunk by chunk, so a range runs in one call. */
    const runWasm = (bound: BoundKernel, archetype: Archetype, start: number, end: number, since: number, scalars: readonly number[], tick: number, partials: number): void => {
        const compiled = bound.compiled();
        if (compiled === null) return;
        const filters = filtersOf(archetype);
        compiled.run(start, end, tick, since,
            ...bound.columnsOf(archetype).map(column => column.byteOffset),
            ...filters.map(filter => filter.ticks.byteOffset),
            ...filters.map(filter => filter.chunks.byteOffset),
            ...scalars,
            ...partials < 0 ? [] : [partials]);
    };

    const runKernelLocally = (bound: BoundKernel, archetype: Archetype, since: number, values: readonly unknown[], args: unknown, tick: number): void => {
        const columns = bound.columnsOf(archetype);
        const filters = filtersOf(archetype);
        const slot = partialCount === 0 ? 0 : takeSlots(1);
        if (bound.compiled() !== null && bound.wasm !== null) return runWasm(bound, archetype, 0, archetype.count, since, [...bound.lookupParameters(), ...scalarValues(bound.wasm.scalars, values, args)], tick, partialAddress(slot));
        const run = bound.kernel();
        forEachPassingRange(filters, since, 0, archetype.count, (start, end) =>
            run(columns, start, end, values, bound.lookups, bound.description.keys, args, kernelCommands, tick, slots, slot * partialCount));
    };

    /** A filtered `up` run's rows of one group, and their parents' rows, reused. */
    let list: Int32Array = new Int32Array(0);
    let parentList: Int32Array = new Int32Array(0);
    /** By index among the matched rows: whether a filtered `up` run must run it. */
    let dirty = new Uint8Array(0);
    const noColumns: readonly TypedArray[] = [];

    /**
     * Runs rows `rows[start]` to `rows[end - 1]` of one archetype, whose parents are rows `parents[n]` of the archetype
     * with id `parentArchetype`, or -1 when they have none with every component `up` reads.
     */
    const runUpRows = (archetype: Archetype, parentArchetype: number, rows: Int32Array, parents: Int32Array, start: number, end: number, values: readonly unknown[], args: unknown, tick: number, slot: number): void => {
        if (kernel !== null && kernel.compiled() !== null && kernel.wasm !== null) {
            const parentColumns = parentArchetype < 0 ? noColumns : kernel.upColumnsOf(state.archetypes[parentArchetype]);
            const ups = kernel.description.upColumns ?? [];
            kernel.compiled()?.run(start, end, tick, -1,
                ...kernel.columnsOf(archetype).map(column => column.byteOffset),
                ...kernel.lookupParameters(),
                rows.byteOffset, parents.byteOffset, parentArchetype >= 0 ? 1 : 0,
                ...ups.map((_, k) => parentColumns[k]?.byteOffset ?? 0),
                ...scalarValues(kernel.wasm.scalars, values, args),
                ...partialCount === 0 ? [] : [partialAddress(slot)]);
            return;
        }
        if (kernel !== null) {
            const parentColumns = parentArchetype < 0 ? noColumns : kernel.upColumnsOf(state.archetypes[parentArchetype]);
            kernel.kernel()(kernel.columnsOf(archetype), start, end, values, kernel.lookups, kernel.description.keys, args, kernelCommands, tick, slots, slot * partialCount, rows, parents, parentColumns, parentArchetype >= 0);
            return;
        }
        if (up === null) return;
        const row = bindRow(archetype);
        const upContext = context.value;
        for (let n = start; n < end; n++) {
            row.index = rows[n];
            upContext.up = up.objectLookup(parentArchetype, parents[n]);
            system.body(row.value, upContext);
        }
    };

    /**
     * Runs an `up` system's rows group by group, depth by depth from the roots, on the main thread. With change filters,
     * a row also passes when its parent may have changed: decided before its depth runs, since its parent ran earlier.
     */
    const runUp = (since: number, values: readonly unknown[], args: unknown, tick: number): void => {
        if (up === null) return;
        const slot = partialCount === 0 ? 0 : takeSlots(1);
        const order = up.levels(matches);
        const ownFilters = [...addedIds, ...changedIds];
        if (since >= 0 && !up.anyChanged(matches, ownFilters, since)) return;
        const froms = matches.map(archetype => sinceFor(archetype, since));
        const filters = matches.map(archetype => filtersOf(archetype));
        let matched = 0;
        for (const archetype of matches) matched += archetype.count;
        if (list.length < matched) {
            // In the arena, so WASM kernels can address them.
            if (list.length > 0) {
                freeArray(state.memory, list);
                freeArray(state.memory, parentList);
            }
            list = allocateArray(state.memory, Int32Array, matched);
            parentList = allocateArray(state.memory, Int32Array, matched);
        }
        // Without a moved entity, changes are pushed down from the rows that changed, so unchanged subtrees cost a check of their chunks.
        const pushed = since >= 0 && state.entities.lastMove <= since;
        if (pushed) {
            if (dirty.length < matched) dirty = new Uint8Array(matched);
            dirty.fill(0, 0, matched);
            up.seed(matches, ownFilters, since, dirty);
        }
        const { rows, parents, globals, groupEnds, groupOwners, groupParents } = order;
        for (let group = 0, start = 0; group < order.groups; start = groupEnds[group++]) {
            const end = groupEnds[group];
            const owner = groupOwners[group];
            const parentArchetype = groupParents[group];
            const archetype = matches[owner];
            const entities = archetype.entities;
            const from = froms[owner];
            if (from < 0) {
                if (pushed) for (let n = start; n < end; n++) up.markChildren(entities[rows[n]] >>> 0, dirty);
                runUpRows(archetype, parentArchetype, rows, parents, start, end, values, args, tick, slot);
                continue;
            }
            const passing = filters[owner];
            let count = 0;
            for (let n = start; n < end; n++) {
                const index = rows[n];
                if (pushed) {
                    if (dirty[globals[n]] === 0) continue;
                    up.markChildren(entities[index] >>> 0, dirty);
                }
                else {
                    let passes = false;
                    for (let f = 0; f < passing.length && !passes; f++) passes = passing[f].ticks[index] > from;
                    if (!passes && !up.parentChanged(archetype, index, from)) continue;
                }
                list[count] = index;
                parentList[count++] = parents[n];
            }
            if (count > 0) runUpRows(archetype, parentArchetype, list, parentList, 0, count, values, args, tick, slot);
        }
    };

    /** WASM kernels with few enough scalars dispatch through shared memory. */
    const isFast = (bound: BoundKernel | null): boolean =>
        bound !== null && bound.wasm !== null && bound.compiled() !== null
        && bound.lookupParameters().length + bound.wasm.scalars.length + (partialCount > 0 ? 2 : 0) <= maximumScalars;
    /** Rows below which an archetype runs on the main thread. Shared-memory dispatch is cheap enough that half the size pays off. */
    const minimumFor = (workers: Workers): number => isFast(kernel) ? workers.minimumChunk / 2 : workers.minimumChunk;

    /**
     * Splits an archetype's rows across workers, at least `minimumChunk` rows each. WASM kernels claim pieces, from
     * home ranges and then from each other, so cores of different speeds finish together; others take even shares.
     */
    const postChunks = (workers: Workers, index: number, archetype: Archetype, since: number, values: readonly unknown[], args: unknown, tick: number): Chunk[] => {
        const { count } = archetype;
        const { pool } = workers;
        const bound = kernel;
        const scalars = bound !== null && bound.wasm !== null ? [...bound.lookupParameters(), ...scalarValues(bound.wasm.scalars, values, args)] : [];
        const fast = isFast(bound);
        const participants = Math.min(pool.size, Math.ceil(count / minimumFor(workers)));
        const aligned = (rows: number): number => Math.ceil(rows / chunkAlignment) * chunkAlignment;
        // WASM chunks go through shared memory. The main thread doesn't take one: measured, it finishes later than an idle worker.
        if (fast) {
            // A split over every worker maps home ranges the same way each run, so each worker gets back the rows it
            // last ran and finds them in its cache; smaller splits rotate, so small archetypes don't queue on one worker.
            const full = participants === pool.size;
            const first = full ? 0 : workers.next;
            if (!full) workers.next = (first + participants) % pool.size;
            const grain = aligned(Math.ceil(count / (participants * claimsPerWorker)));
            // One slot per piece, so the fold's order is the pieces', whichever worker runs each.
            const firstSlot = partialCount === 0 ? 0 : takeSlots(Math.ceil(count / grain));
            return pool.claimed(first, participants, { kernel: index, archetype: archetype.id, start: 0, end: count, tick, lastRun: since, scalars, partials: partialAddress(firstSlot), partialBytes: partialCount * 8 }, grain);
        }
        const size = aligned(Math.ceil(count / participants));
        const chunks: Chunk[] = [];
        for (let start = 0; start < count; start += size) {
            const message = { kind: "run", kernel: index, archetype: archetype.id, start, end: Math.min(count, start + size), tick, lastRun: since, resources: values, args, partials: partialCount === 0 ? -1 : partialAddress(takeSlots(1)) } as const;
            const worker = workers.next;
            workers.next = (worker + 1) % pool.size;
            chunks.push(pool.request(worker, message));
        }
        return chunks;
    };

    const words = new Uint32Array(recordWords);
    const floats = new Float32Array(words.buffer);

    /** One dispatch per archetype, each with its record of row count, column addresses and scalars. */
    const runOnGpu = (values: readonly unknown[], args: unknown, tick: number): void => {
        const gpu = state.gpu;
        if (gpu === null || pipeline === null || kernel === null) return failPlacement("isn't loaded on the GPU");
        const { sources } = kernel.setup;
        const scalars = scalarValues(pipeline.kernel.scalars, values, args);
        const dispatches: { readonly offset: number; readonly count: number }[] = [];
        for (const archetype of matches) {
            if (archetype.count === 0) continue;
            words[0] = archetype.count;
            sources.forEach((source, k) => {
                const storage = source.kind === "field" ? archetype.storageById[source.id] : undefined;
                words[1 + k] = storage === undefined ? 0 : gpu.upload(archetype, storage);
            });
            scalars.forEach((value, s) => { floats[1 + sources.length + s] = value; });
            dispatches.push({ offset: gpu.record(keyOf(archetype), words), count: archetype.count });
        }
        if (dispatches.length === 0) return;
        const pass = gpu.encoder().beginComputePass();
        pass.setPipeline(pipeline.compute);
        for (const { offset, count } of dispatches) {
            pass.setBindGroup(0, gpu.computeGroup(), [offset]);
            const groups = Math.ceil(count / workgroupSize);
            const x = Math.min(groups, maximumWorkgroups);
            pass.dispatchWorkgroups(x, Math.ceil(groups / x));
        }
        pass.end();
        for (const archetype of matches) {
            if (archetype.count === 0) continue;
            for (const id of writes) {
                const storage = archetype.storageById[id];
                if (storage === undefined) continue;
                gpu.markGpuWrites(archetype, storage);
                // Rows a GPU kernel writes are stamped as one, for the whole column.
                if (storage.ticked) storage.columnChanged = tick;
            }
        }
    };

    const runRender = (): void => {
        const gpu = state.gpu;
        // The device may be set to null after the system registered.
        if (gpu === null) return failPlacement("needs a world with a gpu device");
        if (typeof accessors === "string") return;
        const group = declaration.shader?.group ?? 0;
        const tables = matches.filter(archetype => archetype.count > 0).map(archetype => {
            words[0] = archetype.count;
            accessors.forEach((accessor, k) => {
                const storage = archetype.storageById[idOf(state, accessor.component)];
                words[1 + k] = storage === undefined ? 0 : gpu.upload(archetype, storage);
            });
            const offset = gpu.record(keyOf(archetype), words);
            return { count: archetype.count, bind: (pass: GPURenderPassEncoder | GPUComputePassEncoder) => pass.setBindGroup(group, gpu.renderGroup(), [offset]) };
        });
        // Work recorded so far is submitted first, so a body that fails partway loses only its own.
        gpu.submit();
        try {
            system.body({ device: gpu.device, encoder: gpu.encoder(), tables }, context.value);
        }
        catch (error) {
            gpu.discard();
            throw error;
        }
    };

    const conditionIs = (resources?.is ?? []).map(key => idOf(state, key));
    const conditionNot = (resources?.not ?? []).map(key => idOf(state, key));
    /** Whether a condition's value is neither `null` nor `false`. */
    const holding = (id: number): boolean => {
        const { storage, row } = resourceCell(state, state.keys[id]);
        const value = readCell(storage, row);
        return value !== null && value !== false;
    };
    const holds = (): boolean => conditionIs.every(holding) && !conditionNot.some(holding);

    /** A GPU kernel that could never run on the GPU is rejected in every world, with or without one. */
    const load = async (): Promise<void> => {
        if (kernel === null) return;
        sizeSlots();
        await kernel.load();
        if (declaration.kernel !== "gpu") return;
        const generated = kernel.gpu();
        if (typeof generated === "string") return failPlacement(`can't run on the GPU: ${generated}`);
        if (1 + kernel.setup.sources.length + generated.scalars.length > recordWords) failPlacement(`can't run on the GPU: it uses more than ${recordWords - 1} columns and values`);
        const gpu = state.gpu;
        if (placement !== "gpu" || gpu === null) return;
        const { device } = gpu;
        const compute = await device.createComputePipelineAsync({
            layout: device.createPipelineLayout({ bindGroupLayouts: [gpu.computeLayout] }),
            compute: { module: device.createShaderModule({ code: generated.code }), entryPoint: "main" },
        });
        pipeline = { compute, kernel: generated };
    };

    const start = (input: unknown, workers: Workers | null, index: number): readonly Chunk[] => {
        ran = false;
        // A system whose conditions don't hold is skipped, successfully, and keeps its `lastRun`.
        if (!holds()) return [];
        const tick = ++state.tick;
        const args = ownInput(input);
        slotsUsed = 0;
        used = 0;
        holder.buffer = nextBuffer();
        const chunks: Chunk[] = [{ commands: holder.buffer }];
        try {
            const resourcesChanged = resourceChanged.some(key => {
                const { storage, row } = resourceCell(state, key);
                return storage.changed[row] > lastRun;
            });
            /** -1 passes every row. */
            const since = !filtered || resourcesChanged ? -1 : lastRun;
            context.bind();
            if (declaration.input !== undefined) context.value.input = args;
            if (placement === "render") {
                refreshMatches();
                runRender();
                return chunks;
            }
            if (query === undefined) {
                ran = since < 0;
                if (ran) system.body(context.value);
                return chunks;
            }
            // Only a resource filter, and no resource changed: no row passes, unless its parent changed.
            if (since >= 0 && addedIds.length + changedIds.length === 0 && up === null) return chunks;
            ran = true;
            refreshMatches();
            const values = kernel?.description.resources.map(key => {
                const { storage, row } = resourceCell(state, key);
                return readCell(storage, row);
            }) ?? [];
            if (placement === "gpu") {
                runOnGpu(values, args, tick);
                return chunks;
            }
            if (up !== null) {
                runUp(since, values, args, tick);
                return chunks;
            }
            for (const archetype of matches) {
                if (archetype.count === 0) continue;
                const from = sinceFor(archetype, since);
                if (kernel === null) runBody(archetype, from);
                else if (workers !== null && archetype.count >= minimumFor(workers)) {
                    chunks.push(...postChunks(workers, index, archetype, from, values, args, tick));
                    holder.buffer = nextBuffer();
                    chunks.push({ commands: holder.buffer });
                }
                else runKernelLocally(kernel, archetype, from, values, args, tick);
            }
            return chunks;
        }
        catch (error) {
            // Chunks already posted still finish before the sync point.
            chunks.push({ commands: emptyBuffer, error });
            return chunks;
        }
        finally {
            lastRun = tick;
        }
    };

    const finish = (failed: boolean): readonly Float64Array[] | null => {
        if (!ran || failed || targets.length === 0) return null;
        if (kernel === null) return context.reduced;
        targets.forEach((target, t) => folded[t]?.fill(identityOf(target.operator)));
        partialLeaves.forEach(({ target, leaf }, k) => {
            const operator = targets[target]?.operator ?? "+";
            const values = folded[target];
            if (values === undefined) return;
            for (let slot = 0; slot < slotsUsed; slot++) values[leaf] = combine(operator, values[leaf] ?? NaN, slots[slot * partialCount + k] ?? NaN);
        });
        return folded;
    };

    const setup = (index: number): KernelSetup | null => {
        if (kernel === null) return null;
        const compiled = kernel.compiled();
        return {
            index,
            url: kernel.description.url,
            ...kernel.setup,
            added: addedIds,
            changed: changedIds,
            reduces: partialCount > 0,
            wasm: compiled === null || kernel.wasm === null ? null : { module: compiled.module, scalars: kernel.wasm.scalars, imports: kernel.wasm.imports },
        };
    };

    return {
        kernel,
        placement,
        touches,
        writes,
        looks,
        matched: () => {
            refreshMatches();
            return matches;
        },
        load,
        setup,
        start,
        targets,
        finish,
        afterSync: partialCount > 0 ? sizeSlots : null,
    };
};
