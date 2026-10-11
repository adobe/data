import type { Commands } from '../../system/commands.js';
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
import { createContext, createRow, type Cursor } from './rows.js';
import { scalarValues } from './wasm.js';
import { idOf, type State } from './state.js';

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

/**
 * Runs one leaf system. Each run takes a new tick, which becomes the system's `lastRun`.
 * `start` does main-thread work immediately and posts kernel chunks to workers; the chunks' commands merge in returned order.
 */
export type Runner = {
    readonly kernel: BoundKernel | null;
    /** What workers need to load this system's kernel, given its index. */
    readonly setup: (index: number) => KernelSetup | null;
    readonly start: (args: unknown, workers: Workers | null, index: number) => readonly Chunk[];
};

/** Throws if the leaf is a kernel that wasn't compiled or doesn't match its schemas. */
export const createRunner = (state: State, leaf: Leaf): Runner => {
    const { declaration } = leaf;
    // Method parameters are bivariant, so the runtime can see any leaf's body with erased row and context types.
    const system: { body(row: object | undefined, context: object, commands: Commands): void } = leaf;
    const { query, resources } = declaration;
    const required = [...new Set([...query?.read ?? [], ...query?.write ?? [], ...query?.has ?? [], ...query?.added ?? [], ...query?.changed ?? []])].map(key => idOf(state, key));
    const excluded = (query?.not ?? []).map(key => idOf(state, key));
    const addedIds = (query?.added ?? []).map(key => idOf(state, key));
    const changedIds = (query?.changed ?? []).map(key => idOf(state, key));
    const resourceChanged = resources?.changed ?? [];
    const filtered = addedIds.length + changedIds.length + resourceChanged.length > 0;
    let kernel: BoundKernel | null = null;
    if (declaration.kernel === true) {
        const description = kernelOf(leaf);
        if (description === undefined) throw new Error(`System "${declaration.name}" is a kernel but wasn't compiled; add kernelPlugin() to the Vite config.`);
        kernel = bindKernel(state, leaf, description);
    }
    const holder: { buffer: CommandBuffer } = { buffer: createBuffer() };
    /** This system's buffers, reused each run: the sync point clears them. */
    const owned: CommandBuffer[] = [];
    let used = 0;
    const nextBuffer = (): CommandBuffer => owned[used++] ??= createBuffer();
    const commands = createCommands(state, holder);
    const kernelCommands = createKernelCommands(holder, kernel?.setup.keys ?? [], () => reserve(state.entities));
    const context = createContext(state, declaration);
    const matches: Archetype[] = [];
    let checked = 0;
    const rows = new Map<Archetype, { readonly row: object; readonly cursor: Cursor }>();
    let lastRun = 0;

    const refreshMatches = (): void => {
        for (; checked < state.archetypes.length; checked++) {
            const archetype = state.archetypes[checked];
            if (!archetype.resource && required.every(id => archetype.storageOf.has(id)) && !excluded.some(id => archetype.storageOf.has(id))) matches.push(archetype);
        }
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

    const rowOf = (archetype: Archetype): { readonly row: object; readonly cursor: Cursor } => {
        let entry = rows.get(archetype);
        if (entry === undefined) {
            const cursor: Cursor = { row: 0 };
            entry = { row: createRow(state, archetype, query?.read ?? [], query?.write ?? [], cursor), cursor };
            rows.set(archetype, entry);
        }
        return entry;
    };

    const runBody = (archetype: Archetype, since: number): void => {
        const { row, cursor } = rowOf(archetype);
        forEachPassingRange(filtersOf(archetype), since, 0, archetype.count, (start, end) => {
            for (let index = start; index < end; index++) {
                cursor.row = index;
                system.body(row, context, commands);
            }
        });
    };

    /** The kernel applies the change filters itself, chunk by chunk, so a range runs in one call. */
    const runWasm = (bound: BoundKernel, archetype: Archetype, start: number, end: number, since: number, scalars: readonly number[], tick: number): void => {
        const compiled = bound.compiled();
        if (compiled === null) return;
        const filters = filtersOf(archetype);
        compiled.run(start, end, tick, since,
            ...bound.columnsOf(archetype).map(column => column.byteOffset),
            ...filters.map(filter => filter.ticks.byteOffset),
            ...filters.map(filter => filter.chunks.byteOffset),
            ...scalars);
    };

    const runKernelLocally = (bound: BoundKernel, archetype: Archetype, since: number, values: readonly unknown[], args: unknown, tick: number): void => {
        const columns = bound.columnsOf(archetype);
        const filters = filtersOf(archetype);
        if (bound.compiled() !== null && bound.wasm !== null) return runWasm(bound, archetype, 0, archetype.count, since, [...bound.lookupParameters(), ...scalarValues(bound.wasm.scalars, values, args)], tick);
        const run = bound.kernel();
        forEachPassingRange(filters, since, 0, archetype.count, (start, end) =>
            run(columns, start, end, values, bound.lookups, bound.description.keys, args, kernelCommands, tick));
    };

    /** WASM kernels with few enough scalars dispatch through shared memory. */
    const isFast = (bound: BoundKernel | null): boolean =>
        bound !== null && bound.wasm !== null && bound.compiled() !== null && bound.lookupParameters().length + bound.wasm.scalars.length <= maximumScalars;
    /** Rows below which an archetype runs on the main thread. Shared-memory dispatch is cheap enough that half the size pays off. */
    const minimumFor = (workers: Workers): number => isFast(kernel) ? workers.minimumChunk / 2 : workers.minimumChunk;

    /**
     * Splits an archetype's rows across workers, at least `minimumChunk` rows each. WASM kernels claim pieces from a
     * shared counter, so cores of different speeds finish together; others take even shares.
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
            const first = workers.next;
            workers.next = (first + participants) % pool.size;
            const grain = aligned(Math.ceil(count / (participants * claimsPerWorker)));
            return pool.claimed(first, participants, { kernel: index, archetype: archetype.id, start: 0, end: count, tick, lastRun: since, scalars }, grain);
        }
        const size = aligned(Math.ceil(count / participants));
        const chunks: Chunk[] = [];
        for (let start = 0; start < count; start += size) {
            const message = { kind: "run", kernel: index, archetype: archetype.id, start, end: Math.min(count, start + size), tick, lastRun: since, resources: values, args } as const;
            const worker = workers.next;
            workers.next = (worker + 1) % pool.size;
            chunks.push(pool.request(worker, message));
        }
        return chunks;
    };

    const start = (args: unknown, workers: Workers | null, index: number): readonly Chunk[] => {
        const tick = ++state.tick;
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
            context.args = args;
            if (query === undefined) {
                if (since < 0) system.body(undefined, context, commands);
                return chunks;
            }
            // Only a resource filter, and no resource changed: no row passes.
            if (since >= 0 && addedIds.length + changedIds.length === 0) return chunks;
            refreshMatches();
            const values = kernel?.description.resources.map(key => {
                const { storage, row } = resourceCell(state, key);
                return readCell(storage, row);
            }) ?? [];
            for (const archetype of matches) {
                if (archetype.count === 0) continue;
                if (kernel === null) runBody(archetype, since);
                else if (workers !== null && archetype.count >= minimumFor(workers)) {
                    chunks.push(...postChunks(workers, index, archetype, since, values, args, tick));
                    holder.buffer = nextBuffer();
                    chunks.push({ commands: holder.buffer });
                }
                else runKernelLocally(kernel, archetype, since, values, args, tick);
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

    const setup = (index: number): KernelSetup | null => {
        if (kernel === null) return null;
        const compiled = kernel.compiled();
        return {
            index,
            url: kernel.description.url,
            ...kernel.setup,
            added: addedIds,
            changed: changedIds,
            wasm: compiled === null || kernel.wasm === null ? null : { module: compiled.module, scalars: kernel.wasm.scalars, imports: kernel.wasm.imports },
        };
    };

    return { kernel, setup, start };
};
