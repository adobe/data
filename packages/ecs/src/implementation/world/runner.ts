import type { Leaf } from '../../interface/system/leaf.js';
import type { Archetype } from './archetype.js';
import { kernelOf } from './attach-kernel.js';
import { readCell } from './cells.js';
import { createCommands } from './commands.js';
import { bindKernel, type BoundKernel } from './kernels.js';
import type { Pool, TaskResult } from './pool.js';
import { maximumScalars, type KernelSetup } from './protocol.js';
import type { Segment } from './command-ring.js';
import { createBuffer, createKernelCommands, emptyBuffer, stage, type CommandBuffer } from './buffer.js';
import { createBatch, positionalSpawner, type SpawnBatch } from './staging.js';
import { createBlock, endBlock, indexOf, locate, reserveFrom } from './entities.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import { resourceCell } from './resources.js';
import { createContext, parentBinder, rowBinder } from './rows.js';
import { scalarValue, scalarValues } from './wasm.js';
import { idOf, type State } from './state.js';
import { accessorsOf } from '../../interface/gpu/accessors.js';
import { recordWords } from './gpu.js';
import { maximumWorkgroups, workgroupSize, type WgslKernel } from './wgsl.js';
import { allocateArray, freeArray } from './arrays.js';
import { combine, identityOf, reductionTargets, type ReductionTarget } from './reductions.js';
import { samePath, type TypedArray } from '../../interface/registry/layout.js';
import { inputFor } from './input.js';
import { createUp, type Run } from './up.js';
import { labelOf, labelOfItem } from '../../interface/registry/index.js';
import type { RemoteSystem } from './remote-systems.js';
import type { JoinedObserver } from './joined-observer.js';
import { releaseDirectory, type Directory } from './directories.js';
import type { GpuEngine } from './gpu.js';
import { acquireLookups, type IndexLookups, type IndexUse } from './indexes.js';
import { createOrdered, type Ordered, type Passing } from './index-order.js';
import { blockBase, type SortedTable } from './index-sorted.js';
import type { Since } from './index-lookups.js';

/**
 * One unit of a system's work for a run: the commands it issued, or for a worker's chunk its segment of the worker's
 * command ring, plus its error if it failed partway.
 */
export type ChunkResult = { readonly commands: CommandBuffer; readonly segment?: Segment; readonly error?: unknown };
/** An `up` system on workers settles as one chunk, once each depth's pieces have, in turn. */
export type Chunk = ChunkResult | Promise<ChunkResult> | Promise<readonly ChunkResult[]>;

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
const noIndexParameters: readonly number[] = [];

/**
 * Runs one leaf system. Each run takes a new tick, which becomes the system's `lastRun`. `start` does main-thread work
 * immediately and posts kernel chunks to workers; the chunks' commands merge in returned order.
 */
export type Runner = {
    readonly kernel: BoundKernel | null;
    /** Where it runs: the CPU, the GPU as a placed kernel, or the GPU as a render system recording its own work. */
    readonly placement: "cpu" | "gpu" | "render";
    /** Component ids it reads or writes in its query, those it writes, and those its lookups read in any archetype. */
    readonly touches: readonly number[];
    readonly writes: readonly number[];
    readonly looks: readonly number[];
    /** Resource ids it writes or reduces into, which a tail reading them waits for (`tails.ts`). */
    readonly resourceWrites: readonly number[];
    /** The archetypes its query matches now. */
    readonly matched: () => readonly Archetype[];
    /** The indexes its lookups go through, which a run refreshes before its tier. */
    readonly indexes: readonly IndexUse[];
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
    /** What it holds that the world must release once nothing runs it again. */
    readonly holdings: Holdings;
    /** For a system placed on a joined thread, which runs it there (`remote-systems.ts`); null for one that runs here. */
    readonly remote: RemoteSystem | null;
    /** For an observer system on a joined thread, which runs it there after sync points (`joined-observer.ts`); else null. */
    readonly joined: JoinedObserver | null;
    /** The tick it last ran at, which a runner placing it elsewhere starts from. */
    readonly lastRun: () => number;
    /**
     * For a runner the registrar may keep once its system is removed, to run it again when it's registered again: one
     * here, of an observer system, holding nothing beyond its JS values. Makes it as a new runner from tick `since`.
     */
    readonly restart: ((since: number) => void) | null;
};

/**
 * What a runner holds beyond its own JS values: blocks of the arena, the world's records of it, and its hook after each
 * sync point, held weakly. Plain data that holds nothing of its system, so the registrar can release it once the system
 * is collected or removed, and keep it until then without keeping the system.
 */
export type Holdings = {
    /** Set once its system is removed, so no run calls its body again, its rows' included. */
    removed: boolean;
    released: boolean;
    /** Its kernel's reduction partials, in the arena. */
    partials: Float64Array | null;
    /** Its `up` order, in the arena, and its reading of the journal; or its rows in an index's order, in the arena. */
    readonly up: { readonly release: () => void } | null;
    /** Its kernel's lookup directories, which the world keeps current. */
    readonly directories: readonly Directory[];
    /** The indexes its lookups go through, held while it lives. */
    readonly indexes: IndexLookups | null;
    /** The GPU it last recorded on, and the prefix of its records' keys there. */
    gpu: GpuEngine | null;
    readonly prefix: string;
    readonly afterSync: WeakRef<() => void> | null;
    /** For a system placed on a joined thread: what stops it running there once it's removed. */
    remote: { readonly unplace: () => void } | null;
};

/** Whether holdings hold nothing beyond their runner's JS values, so releasing them frees nothing. */
const holdsNothing = (holdings: Holdings): boolean =>
    holdings.partials === null && holdings.up === null && holdings.directories.length === 0 && (holdings.indexes === null || holdings.indexes.uses.length === 0)
    && holdings.gpu === null && holdings.afterSync === null && holdings.remote === null;

/** Holdings of a runner that holds nothing beyond its JS values. */
export const holdingNothing = (remote: Holdings["remote"] = null): Holdings => ({ removed: false, released: false, partials: null, up: null, directories: [], indexes: null, gpu: null, prefix: "", afterSync: null, remote });

/**
 * Stops a runner at once, as its system is removed: no run calls its body again, and on a joined thread no task runs it
 * once this returns. What it holds is released later, once no run in progress uses it.
 */
export const stopHoldings = (holdings: Holdings): void => {
    holdings.removed = true;
    const { remote } = holdings;
    holdings.remote = null;
    remote?.unplace();
};

/** Releases what a runner holds, once: no run may use it again. */
export const releaseHoldings = (state: State, holdings: Holdings): void => {
    if (holdings.released) return;
    holdings.released = true;
    stopHoldings(holdings);
    if (holdings.partials !== null) freeArray(state.memory, holdings.partials);
    holdings.partials = null;
    holdings.up?.release();
    for (const directory of holdings.directories) releaseDirectory(state, directory);
    holdings.indexes?.release();
    // Records on a GPU the world has since left went with it.
    if (holdings.gpu !== null && holdings.gpu === state.gpu) holdings.gpu.release(holdings.prefix);
    if (holdings.afterSync !== null) state.afterSync.delete(holdings.afterSync);
};

/** The resources a declaration writes or reduces into, by id. */
export const resourceWritesOf = (state: State, declaration: Leaf["declaration"]): readonly number[] =>
    [...new Set([...declaration.resources?.write ?? [], ...declaration.reduce === undefined ? [] : Object.getOwnPropertySymbols(declaration.reduce)].map(key => idOf(state, key)))];

/** A number for each leaf, so the GPU records of every runner made for it are its own, whatever its name. */
const leafNumbers = new WeakMap<Leaf, number>();
let leafCount = 0;
const numberOf = (leaf: Leaf): number => {
    let number = leafNumbers.get(leaf);
    if (number === undefined) leafNumbers.set(leaf, number = leafCount++);
    return number;
};

/** Throws if the leaf is a kernel that wasn't compiled. `since` is the tick it last ran at, wherever it ran. */
export const createRunner = (state: State, leaf: Leaf, since = 0): Runner => {
    const { declaration } = leaf;
    const leafNumber = numberOf(leaf);
    const label = labelOfItem(leaf);
    // Method parameters are bivariant, so the runtime can see any leaf's body with erased parameter types.
    const system: { body(subject: unknown, context?: unknown): void } = leaf;
    const { components: query, resources } = declaration;
    const required = [...new Set([...query?.read ?? [], ...query?.write ?? [], ...query?.has ?? [], ...query?.added ?? [], ...query?.changed ?? []])].map(key => idOf(state, key));
    const excluded = (query?.not ?? []).map(key => idOf(state, key));
    const addedIds = (query?.added ?? []).map(key => idOf(state, key));
    const changedIds = (query?.changed ?? []).map(key => idOf(state, key));
    const resourceChanged = resources?.changed ?? [];
    const indexLookups = acquireLookups(state, declaration.lookup, declaration.order);
    /** The indexes whose entries changing passes every row, as a changed resource does: its lookups' with `changed: true`. */
    const indexFilters = indexLookups.filters;
    const indexFiltered = indexFilters.length > 0;
    const filtered = addedIds.length + changedIds.length + resourceChanged.length + indexFilters.length > 0;
    /** Its `lastRun` while it runs, which its lookups' lists and rows compare with. */
    const lookupSince: Since = { value: since };
    let kernel: BoundKernel | null = null;
    if (declaration.kernel !== undefined) {
        const description = kernelOf(leaf);
        if (description === undefined) {
            indexLookups.release();
            throw new Error(`System "${label}" is a kernel but wasn't compiled; add kernelPlugin() to the Vite config.`);
        }
        try {
            kernel = bindKernel(state, leaf, description, indexLookups.byName, lookupSince);
        }
        catch (error) {
            indexLookups.release();
            throw error;
        }
    }
    /** A kernel's lookups through indexes' WASM parameters for the current run, as `refreshIndexes` gave them at its start. */
    let indexParameters: readonly number[] = noIndexParameters;
    const indexed = kernel?.indexes.some(found => found !== null) === true;
    const placement = leaf.kind === "render" ? "render" : declaration.kernel === "gpu" && state.gpu !== null ? "gpu" : "cpu";
    const failPlacement = (message: string): never => { throw new Error(`System "${label}" ${message}.`); };
    // Creating the system and registering its kernel checked its placement, reductions and accessors.
    const up = declaration.up === undefined ? null : createUp(state, declaration.up, filtered);
    /** Its rows in its `order` index's order, run by run. */
    const ordered = indexLookups.ordered === null ? null : createOrdered(state.memory);
    const targets = reductionTargets(state, declaration);
    /** For each partial of the kernel, the target and leaf it folds into. */
    const partialLeaves = (kernel?.description.reductions ?? []).map(reduced => {
        const index = targets.findIndex(target => target.key === reduced.resource);
        const leaf = targets[index]?.leaves.findIndex(candidate => samePath(candidate.path, reduced.path)) ?? -1;
        return leaf < 0 ? failPlacement(`contributes to "${labelOf(reduced.resource)}", which it doesn't reduce`) : { target: index, leaf };
    });
    const accessors = declaration.shader === undefined ? [] : accessorsOf(declaration.shader);
    if (typeof accessors === "string") return failPlacement(`can't render: ${accessors}`);
    const touches = [...new Set([...query?.read ?? [], ...query?.write ?? []])].map(key => idOf(state, key));
    const writes = (query?.write ?? []).map(key => idOf(state, key));
    const looks = [...new Set([...Object.values(declaration.lookup ?? {}).flatMap(lookup => lookup.read ?? []), ...declaration.up?.read ?? []])].map(key => idOf(state, key));
    /** Record keys by archetype. */
    const keys = new Map<Archetype, string>();
    const keyOf = (archetype: Archetype): string => {
        let key = keys.get(archetype);
        if (key === undefined) keys.set(archetype, key = `${leafNumber}:${archetype.id}`);
        return key;
    };
    let pipeline: { readonly compute: GPUComputePipeline; readonly kernel: WgslKernel } | null = null;
    /** This system's buffers, reused each run: the sync point clears them. A run starts on the first. */
    const owned: CommandBuffer[] = [createBuffer()];
    const holder: { buffer: CommandBuffer } = { buffer: owned[0] };
    let used = 0;
    const nextBuffer = (): CommandBuffer => owned[used++] ??= createBuffer();
    /** Each owned buffer as a chunk, made once. */
    const ownedChunks: ChunkResult[] = [{ commands: owned[0] }];
    /**
     * The kernel's spawn batches on the main thread, one per set of components its lists name, emptied at the start of
     * each run, and by batch the first row the current buffer hasn't staged yet.
     */
    const spawnBatches: SpawnBatch[] = [];
    const unstaged: number[] = [];
    /** The spawners' entities, reserved in blocks, ended by each run. */
    const block = createBlock(state.entities);
    const spawners = (kernel?.setup.spawns ?? []).map(ids => {
        const key = [...ids].sort((a, b) => a - b).join(",");
        let batch = spawnBatches.find(candidate => candidate.ids.join(",") === key);
        if (batch === undefined) {
            batch = createBatch(state.layouts, ids);
            spawnBatches.push(batch);
            unstaged.push(0);
        }
        return positionalSpawner(block, reserveFrom, batch, ids, ids.map(id => state.starts[id]));
    });
    /** Whether the kernel spawns, so runs of every other system skip staging. */
    const spawns = spawnBatches.length > 0;
    /** Stages in the current buffer the rows spawned since it took over, so they commit in its place in merge order. */
    const stageSpawns = (): void => {
        for (let b = 0; b < spawnBatches.length; b++) {
            const { count } = spawnBatches[b];
            if (count === unstaged[b]) continue;
            stage(holder.buffer, spawnBatches[b], unstaged[b], count);
            unstaged[b] = count;
        }
    };
    /** Moves `holder` to the run's next buffer, returning it as a chunk. */
    const nextChunk = (): ChunkResult => {
        if (spawns) stageSpawns();
        const index = used;
        holder.buffer = nextBuffer();
        return ownedChunks[index] ??= { commands: holder.buffer };
    };
    /** The chunks of the current run, reused by the next once its tier has taken them. */
    const runChunks: Chunk[] = [];
    const noChunks: readonly Chunk[] = [];
    const noValues: readonly unknown[] = [];
    /** Whether a resource a `changed` filter names changed since the system last ran. */
    const resourceChangedIds = resourceChanged.map(key => idOf(state, key));
    const resourcesChangedSince = (since: number): boolean => {
        const index = indexOf(state.resourceEntity);
        const archetype = state.archetypes[state.entities.archetype[index]];
        const row = state.entities.row[index];
        for (let k = 0; k < resourceChangedIds.length; k++) {
            const storage = archetype?.storageById[resourceChangedIds[k]];
            // Throws, as for a resource not in this world.
            if (storage === undefined) resourceCell(state, resourceChanged[k]);
            else if (storage.changed[row] > since) return true;
        }
        return false;
    };
    const commands = createCommands(state, holder);
    const kernelCommands = createKernelCommands(holder, kernel?.setup.keys ?? [], kernel?.setup.starts ?? [], spawners);
    // A kernel's reductions fold in its partials, so only a body that runs as written gets reducer functions. Render
    // bodies, GPU kernels and observer systems issue no commands.
    const ownInput = inputFor(leaf);
    const context = createContext(state, declaration, {
        targets: kernel === null ? targets : [],
        commands: leaf.kind === "render" || declaration.kernel === "gpu" || declaration.observer === true ? undefined : commands,
        input: declaration.input !== undefined,
        indexes: indexLookups.byName,
        since: lookupSince,
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
        slots = holdings.partials = allocateArray(state.memory, Float64Array, Math.max(needed, 2 * slots.length));
    };
    /** The first of `count` slots for the next kernel calls, each starting at its operators' identities. */
    const takeSlots = (count: number): number => {
        const first = slotsUsed;
        slotsUsed += count;
        // Archetypes change only at sync points, which size the slots for them.
        if (slotsUsed * partialCount > slots.length) throw new Error(`System "${label}" has no room for its reduction partials.`);
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
    const bindParent = parentBinder(state, declaration.up?.read ?? []);
    let lastRun = since;

    function refreshMatches(): void {
        for (; checked < state.archetypes.length; checked++) {
            const archetype = state.archetypes[checked];
            if (!archetype.resource && !(archetype.meta && required.length === 0) && required.every(id => archetype.storageOf.has(id)) && !excluded.some(id => archetype.storageOf.has(id))) matches.push(archetype);
        }
    }

    /** Every row of an archetype passes when a `changed` component's whole column changed since `since`. */
    const sinceFor = (archetype: Archetype, since: number): number => {
        if (since < 0) return since;
        for (const id of changedIds) if ((archetype.storageById[id]?.columnChanged ?? 0) > since) return -1;
        return since;
    };

    /**
     * By archetype: its change filters, `added` then `changed`, rows and chunks, and the WASM addresses of its columns
     * and filters, kept until its arrays are replaced.
     */
    const filterCache = new Map<Archetype, { readonly version: number; readonly filters: readonly Filter[]; addresses: readonly number[] | null }>();
    const noFilters: readonly Filter[] = [];

    const filteredOf = (archetype: Archetype) => {
        const cached = filterCache.get(archetype);
        if (cached !== undefined && cached.version === archetype.version) return cached;
        const filters = addedIds.length + changedIds.length === 0 ? noFilters : [
            ...addedIds.flatMap(id => {
                const storage = archetype.storageById[id];
                return storage === undefined ? [] : [{ ticks: storage.added, chunks: storage.chunkAdded }];
            }),
            ...changedIds.flatMap(id => {
                const storage = archetype.storageById[id];
                return storage === undefined ? [] : [{ ticks: storage.changed, chunks: storage.chunkChanged }];
            }),
        ];
        const entry: { readonly version: number; readonly filters: readonly Filter[]; addresses: readonly number[] | null } = { version: archetype.version, filters, addresses: null };
        filterCache.set(archetype, entry);
        return entry;
    };

    const filtersOf = (archetype: Archetype): readonly Filter[] => filteredOf(archetype).filters;

    const { target } = declaration;
    /** Runs the body on `entity`'s row, when it's alive and its archetype matches. */
    const runTarget = (entity: unknown): void => {
        if (typeof entity !== "number") return;
        const index = locate(state.entities, entity);
        if (index < 0) return;
        const archetype = state.archetypes[state.entities.archetype[index]];
        if (archetype === undefined || !matches.includes(archetype)) return;
        const row = bindRow(archetype);
        row.index = state.entities.row[index];
        system.body(row.value, context.value);
    };

    const runBody = (archetype: Archetype, since: number): void => {
        const row = bindRow(archetype);
        const { value } = row;
        const values = context.value;
        const filters = filtersOf(archetype);
        // Every row passes, so nothing is filtered.
        // A body may remove its own system, after which no row of it runs.
        if (since < 0 || filters.length === 0) {
            for (let index = 0, count = archetype.count; index < count && !holdings.removed; index++) {
                row.index = index;
                system.body(value, values);
            }
            return;
        }
        forEachPassingRange(filters, since, 0, archetype.count, (start, end) => {
            for (let index = start; index < end && !holdings.removed; index++) {
                row.index = index;
                system.body(value, values);
            }
        });
    };

    /** The kernel applies the change filters itself, chunk by chunk, so a range runs in one call. */
    /** A WASM call's arguments, filled in place for each call, so a call allocates nothing. */
    const wasmArguments: number[] = [];

    const runWasm = (bound: BoundKernel, archetype: Archetype, start: number, end: number, since: number, values: readonly unknown[], args: unknown, tick: number, partials: number): void => {
        const compiled = bound.compiled();
        if (compiled === null || bound.wasm === null) return;
        const entry = filteredOf(archetype);
        // Column and filter addresses: the columns are kept per archetype version too.
        const addresses = entry.addresses ??= [
            ...bound.columnsOf(archetype).map(column => column.byteOffset),
            ...entry.filters.map(filter => filter.ticks.byteOffset),
            ...entry.filters.map(filter => filter.chunks.byteOffset),
        ];
        const lookups = bound.lookupParameters();
        const { scalars } = bound.wasm;
        const call = wasmArguments;
        call.length = 4 + addresses.length + lookups.length + indexParameters.length + scalars.length + (partials < 0 ? 0 : 1);
        call[0] = start;
        call[1] = end;
        call[2] = tick;
        call[3] = since;
        let at = 4;
        for (let k = 0; k < addresses.length; k++) call[at++] = addresses[k];
        for (let k = 0; k < lookups.length; k++) call[at++] = lookups[k];
        for (let k = 0; k < indexParameters.length; k++) call[at++] = indexParameters[k];
        for (let k = 0; k < scalars.length; k++) call[at++] = scalarValue(scalars[k], values, args);
        if (partials >= 0) call[at] = partials;
        Reflect.apply(compiled.run, undefined, call);
    };

    const runKernelLocally = (bound: BoundKernel, archetype: Archetype, since: number, values: readonly unknown[], args: unknown, tick: number): void => {
        const slot = partialCount === 0 ? 0 : takeSlots(1);
        if (bound.compiled() !== null && bound.wasm !== null) return runWasm(bound, archetype, 0, archetype.count, since, values, args, tick, partialAddress(slot));
        const columns = bound.columnsOf(archetype);
        const filters = filtersOf(archetype);
        const run = bound.kernel();
        forEachPassingRange(filters, since, 0, archetype.count, (start, end) =>
            run(columns, start, end, values, bound.lookups, bound.description.keys, args, kernelCommands, tick, slots, slot * partialCount));
    };

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
                ...indexParameters,
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
        // The parent's row is bound after the system's own, for the archetype both may share.
        const parentRow = parentArchetype < 0 ? null : bindParent(state.archetypes[parentArchetype]);
        const upContext = context.value;
        upContext.up = parentRow === null ? null : parentRow.value;
        for (let n = start; n < end && !holdings.removed; n++) {
            row.index = rows[n];
            if (parentRow !== null) parentRow.index = parents[n];
            system.body(row.value, upContext);
        }
    };

    /** The tick rows pass after for `runOrdered`'s filters, as `sinceFor` gives it, and those filters. */
    let orderSince = -1;
    const orderPassing: Passing = { filters: filtersOf, since: archetype => sinceFor(archetype, orderSince) };

    /**
     * Runs the rows the `order` index holds in its order, those that pass the change filters, run by run of one
     * archetype, on this thread: commands and reductions follow the index's order.
     */
    const runOrdered = (order: Ordered, since: number, values: readonly unknown[], args: unknown, tick: number): void => {
        const sorted = indexLookups.ordered?.sorted ?? null;
        if (sorted === null) return;
        if (kernel === null && since < 0) return runBodiesInOrder(order, sorted);
        orderSince = since;
        const runs = order.runs(sorted, matches, since < 0 ? null : orderPassing);
        const slot = partialCount === 0 ? 0 : takeSlots(1);
        const contextValue = context.value;
        for (let k = 0; k < runs.length && !holdings.removed; k++) {
            const run = runs[k];
            const archetype = matches[run.owner];
            if (kernel !== null) {
                runUpRows(archetype, -1, run.rows, run.parents, run.start, run.end, values, args, tick, slot);
                continue;
            }
            const row = bindRow(archetype);
            const { value } = row;
            for (let n = run.start; n < run.end && !holdings.removed; n++) {
                row.index = run.rows[n];
                system.body(value, contextValue);
            }
        }
    };

    /** Every row the `order` index holds of the matches, walking its entries, its body bound again where the archetype changes. */
    const runBodiesInOrder = (order: Ordered, sorted: SortedTable): void => {
        const owners = order.owners(matches);
        const { entries, stride, words, lengths, blocks } = sorted;
        const contextValue = context.value;
        let current = -1;
        let row: ReturnType<typeof bindRow> | null = null;
        let value: object | null = null;
        for (let k = 0; k < blocks && !holdings.removed; k++) {
            const block = sorted.order[k];
            const base = blockBase(sorted, block) + words;
            for (let j = 0, length = lengths[block]; j < length && !holdings.removed; j++) {
                const at = base + j * stride;
                const archetype = entries[at + 1];
                const owner = archetype < owners.length ? owners[archetype] : -1;
                if (owner < 0) continue;
                if (owner !== current || row === null || value === null) {
                    row = bindRow(matches[owner]);
                    value = row.value;
                    current = owner;
                }
                row.index = entries[at + 2];
                system.body(value, contextValue);
            }
        }
    };

    /** Posts listed rows to workers as claimed pieces of a WASM kernel, which takes `up`'s addresses after the lookups. */
    const postUp = (workers: Workers, index: number, run: Run, values: readonly unknown[], args: unknown, tick: number): Promise<TaskResult>[] => {
        if (kernel === null || kernel.wasm === null) return [];
        const parentColumns = run.parent < 0 ? noColumns : kernel.upColumnsOf(state.archetypes[run.parent]);
        const scalars = [
            ...kernel.lookupParameters(),
            ...indexParameters,
            run.rows.byteOffset, run.parents.byteOffset, run.parent >= 0 ? 1 : 0,
            ...(kernel.description.upColumns ?? []).map((_, k) => parentColumns[k]?.byteOffset ?? 0),
            ...scalarValues(kernel.wasm.scalars, values, args),
        ];
        const count = run.end - run.start;
        const { pool } = workers;
        const participants = Math.min(pool.size, Math.ceil(count / minimumFor(workers)));
        const first = workers.next;
        workers.next = (first + participants) % pool.size;
        const grain = Math.ceil(count / (participants * claimsPerWorker) / chunkAlignment) * chunkAlignment;
        return pool.claimed(first, participants, { kernel: index, archetype: matches[run.owner].id, start: run.start, end: run.end, tick, lastRun: -1, scalars, partials: -1, partialBytes: 0 }, grain);
    };

    /**
     * Runs an `up` system's rows depth by depth from the roots, each depth's groups on the main thread or, for a WASM
     * kernel without reductions, across workers, settling before the next depth starts. With change filters, only the
     * rows `up` marks run: those passing the filters, and those whose parent changed. Returns a chunk when workers run
     * any of it.
     */
    const runUp = (since: number, values: readonly unknown[], args: unknown, tick: number, workers: Workers | null, index: number): Promise<readonly ChunkResult[]> | null => {
        if (up === null) return null;
        const slot = partialCount === 0 ? 0 : takeSlots(1);
        let next: () => readonly Run[] | null;
        let clear = (): void => {};
        if (since < 0) {
            const order = up.levels(matches);
            let depth = 0;
            next = () => {
                if (depth >= order.levels) return null;
                const runs: Run[] = [];
                for (let group = order.depthGroups[depth]; group < order.depthGroups[depth + 1]; group++) {
                    if (order.groupEnds[group] === order.groupStarts[group]) continue;
                    runs.push({ owner: order.groupOwners[group], parent: order.groupParents[group], rows: order.rows, parents: order.parents, start: order.groupStarts[group], end: order.groupEnds[group] });
                }
                depth++;
                return runs;
            };
        }
        else {
            const pass = up.filtered(matches, addedIds, changedIds, since);
            if (pass === null) return null;
            next = pass.next;
            clear = pass.clear;
        }
        const runLocally = (run: Run): void => runUpRows(matches[run.owner], run.parent, run.rows, run.parents, run.start, run.end, values, args, tick, slot);
        const parallel = workers !== null && kernel !== null && kernel.wasm !== null && kernel.compiled() !== null && partialCount === 0
            && kernel.lookupParameters().length + indexParameters.length + 3 + (kernel.description.upColumns?.length ?? 0) + kernel.wasm.scalars.length <= maximumScalars;
        if (!parallel || workers === null) {
            try {
                for (let runs = next(); runs !== null; runs = next()) for (const run of runs) runLocally(run);
            }
            finally {
                clear();
            }
            return null;
        }
        return (async (): Promise<readonly ChunkResult[]> => {
            const results: ChunkResult[] = [];
            try {
                for (let runs = next(); runs !== null; runs = next()) {
                    const pending: Promise<TaskResult>[] = [];
                    for (const run of runs) {
                        if (run.end - run.start >= minimumFor(workers)) pending.push(...postUp(workers, index, run, values, args, tick));
                        else runLocally(run);
                    }
                    // A depth run on the main thread alone needs no wait.
                    if (pending.length === 0) continue;
                    const settled = await Promise.all(pending);
                    results.push(...settled);
                    // A failed depth stops the deeper ones, which would read what it didn't write.
                    if (settled.some(result => result.error !== undefined)) return results;
                }
            }
            catch (error) {
                results.push({ commands: emptyBuffer, error });
            }
            finally {
                clear();
            }
            return results;
        })();
    };

    /** WASM kernels with few enough scalars dispatch through shared memory. */
    const isFast = (bound: BoundKernel | null): boolean =>
        bound !== null && bound.wasm !== null && bound.compiled() !== null
        && bound.lookupParameters().length + indexParameters.length + bound.wasm.scalars.length + (partialCount > 0 ? 2 : 0) <= maximumScalars;
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
        const scalars = bound !== null && bound.wasm !== null ? [...bound.lookupParameters(), ...indexParameters, ...scalarValues(bound.wasm.scalars, values, args)] : [];
        const fast = isFast(bound);
        const participants = Math.min(pool.size, Math.ceil(count / minimumFor(workers)));
        const aligned = (rows: number): number => Math.ceil(rows / chunkAlignment) * chunkAlignment;
        // WASM chunks go through shared memory. The main thread doesn't take one: measured, it finishes later than an
        // idle worker.
        if (fast) {
            // A split over every worker maps home ranges the same way each run, so each worker gets back the rows it
            // last ran and finds them in its cache; smaller splits rotate, so small archetypes don't queue on one
            // worker.
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
            const message = {
                kind: "run", kernel: index, archetype: archetype.id, start, end: Math.min(count, start + size), tick, lastRun: since, resources: values, args,
                partials: partialCount === 0 ? -1 : partialAddress(takeSlots(1)), lookups: bound === null ? noIndexParameters : bound.lookupParameters(), indexes: indexParameters,
            } as const;
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
        holdings.gpu = gpu;
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

    /** The component ids of the parent columns an `up` kernel reads, in order. */
    const upIds = (kernel?.description.upColumns ?? []).map(column => column.kind === "field" ? idOf(state, column.component) : -1);
    /** The order whose row lists the GPU holds. */
    let uploadedOrder: object | null = null;

    /**
     * An `up` kernel on the GPU: a dispatch per group, in order, in one pass, which keeps each depth's writes visible
     * to the next. Each record has the group's row count, its archetype's columns, its rows' and parents' rows'
     * addresses, whether it has a parent, the parent archetype's columns, and the scalars.
     */
    const runUpOnGpu = (values: readonly unknown[], args: unknown, tick: number): void => {
        const gpu = state.gpu;
        if (gpu === null || pipeline === null || kernel === null || up === null) return failPlacement("isn't loaded on the GPU");
        holdings.gpu = gpu;
        const order = up.levels(matches);
        const fresh = order !== uploadedOrder;
        const rowsAddress = gpu.uploadIndexes(`${leafNumber}:rows`, order.rows, order.size, fresh);
        const parentsAddress = gpu.uploadIndexes(`${leafNumber}:parents`, order.parents, order.size, fresh);
        uploadedOrder = order;
        const { sources } = kernel.setup;
        const scalars = scalarValues(pipeline.kernel.scalars, values, args);
        const dispatches: { readonly offset: number; readonly count: number }[] = [];
        for (let group = 0; group < order.groups; group++) {
            const start = order.groupStarts[group];
            const count = order.groupEnds[group] - start;
            if (count === 0) continue;
            const archetype = matches[order.groupOwners[group]];
            const parentId = order.groupParents[group];
            const parent = parentId < 0 ? null : state.archetypes[parentId];
            words[0] = count;
            sources.forEach((source, k) => {
                const storage = source.kind === "field" ? archetype.storageById[source.id] : undefined;
                words[1 + k] = storage === undefined ? 0 : gpu.upload(archetype, storage);
            });
            const base = 1 + sources.length;
            words[base] = rowsAddress + start;
            words[base + 1] = parentsAddress + start;
            words[base + 2] = parent === null ? 0 : 1;
            upIds.forEach((id, k) => {
                const storage = parent?.storageById[id];
                words[base + 3 + k] = parent === null || storage === undefined ? 0 : gpu.upload(parent, storage);
            });
            scalars.forEach((value, s) => { floats[base + 3 + upIds.length + s] = value; });
            dispatches.push({ offset: gpu.record(`${leafNumber}:up:${group}`, words), count });
        }
        if (dispatches.length > 0) {
            const pass = gpu.encoder().beginComputePass();
            pass.setPipeline(pipeline.compute);
            for (const { offset, count } of dispatches) {
                pass.setBindGroup(0, gpu.computeGroup(), [offset]);
                const groups = Math.ceil(count / workgroupSize);
                const x = Math.min(groups, maximumWorkgroups);
                pass.dispatchWorkgroups(x, Math.ceil(groups / x));
            }
            pass.end();
        }
        for (const archetype of matches) {
            if (archetype.count === 0) continue;
            for (const id of writes) {
                const storage = archetype.storageById[id];
                if (storage === undefined) continue;
                gpu.markGpuWrites(archetype, storage);
                if (storage.ticked) storage.columnChanged = tick;
            }
        }
    };

    const runRender = (): void => {
        const gpu = state.gpu;
        // The device may be set to null after the system registered.
        if (gpu === null) return failPlacement("needs a world with a gpu device");
        if (typeof accessors === "string") return;
        holdings.gpu = gpu;
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

    const holdings: Holdings = {
        removed: false, released: false, partials: null, up: up ?? ordered, directories: kernel?.directories ?? [], indexes: indexLookups, gpu: null, prefix: `${leafNumber}:`,
        afterSync: partialCount > 0 ? new WeakRef(sizeSlots) : null, remote: null,
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
    const conditioned = conditionIs.length + conditionNot.length > 0;
    /** Whether an index of `indexFilters` changed its entries since `since`: refreshed before its tier, so current. */
    const indexesChangedSince = (since: number): boolean => {
        for (let k = 0; k < indexFilters.length; k++) if (indexFilters[k].changed > since) return true;
        return false;
    };
    /** Whether its only change filters are indexes, so a run in which none changed passes no row. */
    const indexesOnly = indexFiltered && addedIds.length + changedIds.length + resourceChanged.length === 0 && up === null;

    /** A GPU kernel that could never run on the GPU is rejected in every world, with or without one. */
    const load = async (): Promise<void> => {
        if (kernel === null) return;
        sizeSlots();
        await kernel.load();
        if (declaration.kernel !== "gpu") return;
        const generated = kernel.gpu();
        if (typeof generated === "string") return failPlacement(`can't run on the GPU: ${generated}`);
        const upWords = up === null ? 0 : 3 + (kernel.description.upColumns?.length ?? 0);
        if (1 + kernel.setup.sources.length + upWords + generated.scalars.length > recordWords) failPlacement(`can't run on the GPU: it uses more than ${recordWords - 1} columns and values`);
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
        // Removed during the run it's in: its body isn't called again.
        if (holdings.removed) return noChunks;
        // A system whose conditions don't hold is skipped, successfully, and keeps its `lastRun`.
        if (conditioned && !holds()) return noChunks;
        const indexesChanged = indexFiltered && indexesChangedSince(lastRun);
        // One filtered only by indexes, none of which changed, is skipped as when a condition fails.
        if (indexesOnly && !indexesChanged) return noChunks;
        const tick = ++state.tick;
        for (let k = 0; k < writes.length; k++) state.written[writes[k]] = tick;
        lookupSince.value = lastRun;
        const args = ownInput(input);
        slotsUsed = 0;
        // The last run's spawns were committed, or dropped with its sync point.
        if (spawns) for (let b = 0; b < spawnBatches.length; b++) spawnBatches[b].count = unstaged[b] = 0;
        const chunks = runChunks;
        // Truncated to one rather than emptied: emptying an array drops its backing store, which the push would
        // allocate again. Setting the length costs a run more than the check, so it's set only when it differs.
        if (chunks.length !== 1) chunks.length = 1;
        // The first buffer, as `nextChunk` gives it, with nothing staged yet to stage.
        used = 1;
        holder.buffer = owned[0];
        chunks[0] = ownedChunks[0];
        try {
            const resourcesChanged = indexesChanged || (resourceChanged.length > 0 && resourcesChangedSince(lastRun));
            /** -1 passes every row. */
            const since = !filtered || resourcesChanged ? -1 : lastRun;
            context.bind();
            if (declaration.input !== undefined) context.value.input = args;
            if (indexed && kernel !== null) indexParameters = kernel.refreshIndexes(lastRun);
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
            // Only resource and index filters, none of which changed: no row passes, unless its parent changed.
            if (since >= 0 && addedIds.length + changedIds.length === 0 && up === null) return chunks;
            ran = true;
            refreshMatches();
            if (target !== undefined) {
                runTarget(Reflect.get(Object(args), target));
                return chunks;
            }
            const values = kernel === null || kernel.description.resources.length === 0 ? noValues : kernel.description.resources.map(key => {
                const { storage, row } = resourceCell(state, key);
                return readCell(storage, row);
            });
            if (placement === "gpu") {
                if (up !== null) runUpOnGpu(values, args, tick);
                else runOnGpu(values, args, tick);
                return chunks;
            }
            if (up !== null) {
                const parallel = runUp(since, values, args, tick, workers, index);
                if (parallel !== null) chunks.push(parallel);
                return chunks;
            }
            if (ordered !== null) {
                runOrdered(ordered, since, values, args, tick);
                return chunks;
            }
            for (const archetype of matches) {
                if (archetype.count === 0) continue;
                const from = sinceFor(archetype, since);
                if (kernel === null) runBody(archetype, from);
                else if (workers !== null && archetype.count >= minimumFor(workers)) {
                    chunks.push(...postChunks(workers, index, archetype, from, values, args, tick));
                    chunks.push(nextChunk());
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
            if (spawns) {
                stageSpawns();
                endBlock(block, state.unused);
            }
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
            // A worker's commands and spawns leave other components' starts to the world, so only data crosses.
            starts: kernel.setup.starts.map((start, k) => state.layouts[kernel.setup.keys[k]]?.kind === "linear" ? start : null),
            // An `up` kernel is passed only the rows that pass its filters.
            added: up === null ? addedIds : [],
            changed: up === null ? changedIds : [],
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
        resourceWrites: resourceWritesOf(state, declaration),
        matched: () => {
            refreshMatches();
            return matches;
        },
        indexes: indexLookups.uses,
        load,
        setup,
        start,
        targets,
        finish,
        afterSync: partialCount > 0 ? sizeSlots : null,
        holdings,
        remote: null,
        joined: null,
        lastRun: () => lastRun,
        restart: declaration.observer !== true || !holdsNothing(holdings) ? null : since => {
            lastRun = since;
            holdings.removed = false;
            holdings.released = false;
        },
    };
};

const nothing: readonly never[] = [];

/** What runs read in place of a runner whose system was removed during them: it runs nothing. */
export const removedRunner: Runner = {
    kernel: null,
    placement: "cpu",
    touches: nothing,
    writes: nothing,
    looks: nothing,
    resourceWrites: nothing,
    matched: () => nothing,
    indexes: nothing,
    load: async () => {},
    setup: () => null,
    start: () => nothing,
    targets: nothing,
    finish: () => null,
    afterSync: null,
    holdings: { ...holdingNothing(), removed: true, released: true },
    remote: null,
    joined: null,
    lastRun: () => 0,
    restart: null,
};
