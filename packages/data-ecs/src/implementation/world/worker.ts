import type { Entity } from '../../interface/entity/entity.js';
import { locate } from './entities.js';
import { createBatch, positionalSpawner, postBatch, type Positional, type SpawnBatch } from './staging.js';
import type { Kernel, KernelModule } from './kernel.js';
import { layoutOf, viewsOf, type Layout, type TypedArray, type Views } from '../../interface/registry/layout.js';
import { emptyViews } from './arrays.js';
import { claimPiece } from './claims.js';
import { controlWords, done, epoch, lineWords, posted, ringSize, signal, taskFields, taskWords, type ArchetypeLayout, type EntitiesLayout, type FromWorker, type KernelSetup, type LookupSetup, type PostedSpawns, type ToWorker, type WorkerError } from './protocol.js';
import { createBuffer, createKernelCommands, type CommandBuffer } from './buffer.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import { instantiateWasm, scalarValues, type WasmRun } from './wasm.js';

/** A worker's views of one archetype's columns in the shared memory. */
type ArchetypeViews = {
    readonly entities: Float64Array;
    readonly storages: ReadonlyMap<number, {
        readonly views: Views;
        readonly added: Float64Array;
        readonly changed: Float64Array;
        readonly chunkAdded: Float64Array;
        readonly chunkChanged: Float64Array;
    }>;
};

type EntityViews = { cursor: Int32Array; free: Int32Array; generation: Uint32Array; archetype: Int32Array; row: Uint32Array; length: number };

type LoadedKernel = {
    readonly setup: KernelSetup;
    readonly kernel: Kernel;
    readonly wasm: WasmRun | null;
    readonly lookups: readonly ((entity: Entity) => readonly unknown[] | null)[];
    /** Where its spawns are staged, one batch per set of components its lists name, with its spawners; made on first run. */
    staging: { readonly batches: readonly SpawnBatch[]; readonly spawners: readonly Positional[] } | null;
};

let memory: WebAssembly.Memory | null = null;
const layouts: Layout[] = [];
const archetypes = new Map<number, ArchetypeViews>();
let entities: EntityViews | null = null;
const kernels = new Map<number, LoadedKernel>();
/** Columns per kernel and archetype, rebuilt after every layout change. */
const columns = new Map<string, readonly TypedArray[]>();

const required = <T>(value: T | null, what: string): T => {
    if (value === null) throw new Error(`Worker received a task before its ${what}.`);
    return value;
};

/** The tick arrays of a component without ticks. */
const noTicks = new Float64Array(0);

const viewArchetype = (buffer: ArrayBufferLike, layout: ArchetypeLayout): ArchetypeViews => ({
    entities: new Float64Array(buffer, layout.entities, layout.capacity),
    storages: new Map(layout.storages.map(storage => {
        const componentLayout = layouts[storage.id];
        return [storage.id, {
            views: componentLayout.kind === "linear" && storage.column >= 0 ? viewsOf(buffer, storage.column, layout.capacity * componentLayout.stride) : emptyViews,
            added: storage.ticked ? new Float64Array(buffer, storage.added, layout.capacity) : noTicks,
            changed: storage.ticked ? new Float64Array(buffer, storage.changed, layout.capacity) : noTicks,
            chunkAdded: storage.ticked ? new Float64Array(buffer, storage.chunkAdded, storage.chunks) : noTicks,
            chunkChanged: storage.ticked ? new Float64Array(buffer, storage.chunkChanged, storage.chunks) : noTicks,
        }];
    })),
});

const viewEntities = (buffer: ArrayBufferLike, layout: EntitiesLayout): EntityViews => ({
    cursor: new Int32Array(buffer, layout.cursor, 4),
    free: new Int32Array(buffer, layout.free, layout.freeCapacity),
    archetype: new Int32Array(buffer, layout.archetype, layout.capacity),
    row: new Uint32Array(buffer, layout.row, layout.capacity),
    generation: new Uint32Array(buffer, layout.generation, layout.capacity),
    length: layout.length,
});

const createLookup = (lookup: LookupSetup) => (entity: Entity): readonly unknown[] | null => {
    const table = required(entities, "layout");
    const index = locate(table, entity);
    if (index < 0) return null;
    const archetype = archetypes.get(table.archetype[index]);
    if (archetype === undefined) return null;
    for (const id of lookup.read) if (!archetype.storages.has(id)) return null;
    for (const id of lookup.has) if (!archetype.storages.has(id)) return null;
    for (const id of lookup.not) if (archetype.storages.has(id)) return null;
    const row = table.row[index];
    return lookup.read.map(id => {
        const layout = layouts[id];
        const storage = archetype.storages.get(id);
        return layout.kind === "linear" && storage !== undefined ? layout.read(storage.views, row) : layout.kind === "constant" ? layout.value : undefined;
    });
};

/** The one element a muted tick column's stores land on. */
const mutedColumn = new Float64Array(1);

const columnsOf = (loaded: LoadedKernel, archetypeId: number): readonly TypedArray[] => {
    const key = `${loaded.setup.index}:${archetypeId}`;
    const cached = columns.get(key);
    if (cached !== undefined) return cached;
    const archetype = archetypes.get(archetypeId);
    if (archetype === undefined) throw new Error(`Worker has no layout for archetype ${archetypeId}.`);
    const built = loaded.setup.sources.map((source, k) => {
        if (loaded.setup.muted[k]) return mutedColumn;
        if (source.kind === "entity") return archetype.entities;
        const storage = archetype.storages.get(source.id);
        if (storage === undefined) throw new Error(`Archetype ${archetypeId} lacks component ${source.id}.`);
        if (source.kind === "changed") return storage.changed;
        if (source.kind === "chunks") return storage.chunkChanged;
        const layout = layouts[source.id];
        if (layout.kind !== "linear") throw new Error(`Component ${source.id} isn't linear.`);
        return storage.views[layout.leaves[source.leaf].view];
    });
    columns.set(key, built);
    return built;
};

type RunMessage = Extract<ToWorker, { kind: "run" }>;

/** A kernel's change filters in an archetype: `added` then `changed`, rows and chunks. */
const filtersOf = (loaded: LoadedKernel, archetype: ArchetypeViews): Filter[] => [
    ...loaded.setup.added.flatMap(id => {
        const storage = archetype.storages.get(id);
        return storage === undefined ? [] : [{ ticks: storage.added, chunks: storage.chunkAdded }];
    }),
    ...loaded.setup.changed.flatMap(id => {
        const storage = archetype.storages.get(id);
        return storage === undefined ? [] : [{ ticks: storage.changed, chunks: storage.chunkChanged }];
    }),
];

const noPartials = new Float64Array(0);

/** A kernel's staging, made once its components' layouts are known. */
const stagingOf = (loaded: LoadedKernel): NonNullable<LoadedKernel["staging"]> => {
    if (loaded.staging !== null) return loaded.staging;
    const table = required(entities, "layout");
    const batches: SpawnBatch[] = [];
    const spawners = loaded.setup.spawns.map(ids => {
        const key = [...ids].sort((a, b) => a - b).join(",");
        let batch = batches.find(candidate => candidate.ids.join(",") === key);
        if (batch === undefined) batches.push(batch = createBatch(layouts, ids));
        return positionalSpawner(table, batch, ids, ids.map(id => loaded.setup.starts[loaded.setup.keys.indexOf(id)]));
    });
    return loaded.staging = { batches, spawners };
};

/** Takes the spawns a task staged, in batch order, emptying the batches. */
const takeSpawns = (message: ToWorker, transfer: ArrayBuffer[]): readonly PostedSpawns[] => {
    if (message.kind !== "run") return noSpawns;
    const staging = kernels.get(message.kernel)?.staging ?? null;
    if (staging === null) return noSpawns;
    const spawns: PostedSpawns[] = [];
    for (const batch of staging.batches) if (batch.count > 0) spawns.push(postBatch(batch, transfer));
    return spawns;
};

const noSpawns: readonly PostedSpawns[] = [];

const run = (message: RunMessage, buffer: CommandBuffer): void => {
    const loaded = kernels.get(message.kernel);
    if (loaded === undefined) throw new Error(`Worker has no kernel ${message.kernel}.`);
    const archetype = archetypes.get(message.archetype);
    if (archetype === undefined) throw new Error(`Worker has no layout for archetype ${message.archetype}.`);
    const commands = createKernelCommands({ buffer }, loaded.setup.keys, loaded.setup.starts, stagingOf(loaded).spawners);
    const kernelColumns = columnsOf(loaded, message.archetype);
    const filters = filtersOf(loaded, archetype);
    const { wasm } = loaded;
    if (wasm !== null && loaded.setup.wasm !== null) {
        wasm(message.start, message.end, message.tick, message.lastRun,
            ...kernelColumns.map(column => column.byteOffset),
            ...filters.map(filter => filter.ticks.byteOffset),
            ...filters.map(filter => filter.chunks.byteOffset),
            ...scalarValues(loaded.setup.wasm.scalars, message.resources, message.args),
            ...message.partials < 0 ? [] : [message.partials]);
        return;
    }
    const partials = message.partials < 0 ? noPartials : new Float64Array(required(memory, "memory").buffer, message.partials);
    forEachPassingRange(filters, message.lastRun, message.start, message.end, (start, end) =>
        loaded.kernel(kernelColumns, start, end, message.resources, loaded.lookups, loaded.setup.keys, message.args, commands, message.tick, partials, 0));
};

const load = async (setups: readonly KernelSetup[]): Promise<void> => {
    const shared = required(memory, "memory");
    const loaded = await Promise.all(setups.map(async setup => {
        const module: KernelModule = await import(/* @vite-ignore */ setup.url);
        const wasm = setup.wasm === null ? null : await instantiateWasm(setup.wasm.module, shared, setup.wasm.imports);
        return { module, wasm };
    }));
    // A kernel loaded again may have different columns, such as muted ones now stamped.
    columns.clear();
    setups.forEach((setup, i) => kernels.set(setup.index, { setup, kernel: loaded[i].module.create(setup.booleans, setup.strides.map((stride, k) => setup.muted[k] ? 0 : stride), setup.offsets.map((offset, k) => setup.muted[k] ? 0 : offset), setup.up.booleans, setup.up.strides, setup.up.offsets), wasm: loaded[i].wasm, lookups: setup.lookups.map(createLookup), staging: null }));
};

/** A split's claims, as this worker sees them. */
type Claims = { readonly words: Int32Array; readonly self: number; readonly participants: number };

/**
 * Runs a loaded kernel's WASM over rows `start` to `end` of an archetype; it applies the change filters itself.
 * With claims, runs only the `grain`-row pieces this worker claims.
 */
const runWasm = (loaded: LoadedKernel, archetypeId: number, start: number, end: number, tick: number, lastRun: number, scalars: readonly number[], claims: Claims | null, grain: number, partials: number, partialBytes: number): void => {
    const { wasm } = loaded;
    if (wasm === null) throw new Error(`Worker kernel ${loaded.setup.index} has no WASM.`);
    const archetype = archetypes.get(archetypeId);
    if (archetype === undefined) throw new Error(`Worker has no layout for archetype ${archetypeId}.`);
    const filters = filtersOf(loaded, archetype);
    const parameters = [
        ...columnsOf(loaded, archetypeId).map(column => column.byteOffset),
        ...filters.map(filter => filter.ticks.byteOffset),
        ...filters.map(filter => filter.chunks.byteOffset),
        ...scalars,
    ];
    if (claims === null) {
        if (partials < 0) return void wasm(start, end, tick, lastRun, ...parameters);
        // An even share with reductions runs piece by piece, each into its own partials, as claims would.
        for (let from = start, piece = 0; from < end; from += grain, piece++) wasm(from, Math.min(end, from + grain), tick, lastRun, ...parameters, partials + piece * partialBytes);
        return;
    }
    const { words, self, participants } = claims;
    for (let piece = claimPiece(words, self, participants); piece >= 0; piece = claimPiece(words, self, participants)) {
        const from = start + piece * grain;
        wasm(from, Math.min(end, from + grain), tick, lastRun, ...parameters, ...partials < 0 ? [] : [partials + piece * partialBytes]);
    }
};

/**
 * Runs tasks from this worker's ring in shared memory, blocking between them, until the main thread asks it to leave;
 * then it returns to handling messages.
 */
const runWindow = (message: Extract<ToWorker, { kind: "window" }>): void => {
    const buffer = required(memory, "memory").buffer;
    const control = new Int32Array(buffer, message.control + message.worker * controlWords * 4, controlWords);
    const statuses = new Int32Array(buffer, message.statuses + message.worker * ringSize * 4, ringSize);
    const payloads = new Float64Array(buffer, message.payloads + message.worker * ringSize * taskWords * 8, ringSize * taskWords);
    let next = Atomics.load(control, done);
    for (;;) {
        const seen = Atomics.load(control, signal);
        if (next < Atomics.load(control, posted)) {
            const ring = next % ringSize;
            const base = ring * taskWords;
            // A task from a later window waits until this worker has handled the messages sent before it.
            if (payloads[base + 6] !== message.epoch) return;
            let status = next + 1;
            try {
                const loaded = kernels.get(payloads[base]);
                if (loaded === undefined || broken !== null) throw new Error("Worker can't run this task.");
                const line = payloads[base + 8];
                const participants = payloads[base + 11];
                const scalarCount = payloads[base + 7];
                const partials = loaded.setup.reduces ? payloads[base + taskFields + scalarCount] : -1;
                const partialBytes = loaded.setup.reduces ? payloads[base + taskFields + scalarCount + 1] : 0;
                runWasm(loaded, payloads[base + 1], payloads[base + 2], payloads[base + 3], payloads[base + 4], payloads[base + 5],
                    Array.from(payloads.subarray(base + taskFields, base + taskFields + scalarCount)),
                    line < 0 ? null : { words: new Int32Array(buffer, message.claims + line * lineWords * 4, participants * lineWords), self: payloads[base + 10], participants },
                    payloads[base + 9], partials ?? -1, partialBytes ?? 0);
            }
            catch {
                status = -status;
            }
            Atomics.store(statuses, ring, status);
            next++;
            Atomics.store(control, done, next);
            Atomics.notify(control, done);
            continue;
        }
        if (Atomics.load(control, epoch) !== message.epoch) return;
        // Tiers follow each other closely, so spin briefly before paying for a blocking wait's wake-up.
        const deadline = performance.now() + 0.05;
        while (Atomics.load(control, signal) === seen && performance.now() < deadline);
        if (Atomics.load(control, signal) === seen) Atomics.wait(control, signal, seen);
    }
};

const applyLayout = (message: Extract<ToWorker, { kind: "layout" }>): void => {
    const buffer = required(memory, "memory").buffer;
    for (const [id, schema] of message.schemas) layouts[id] = layoutOf(schema);
    // Updated in place, since spawners hold the table.
    if (entities === null) entities = viewEntities(buffer, message.entities);
    else Object.assign(entities, viewEntities(buffer, message.entities));
    for (const archetype of message.archetypes) archetypes.set(archetype.id, viewArchetype(buffer, archetype));
    columns.clear();
};

const errorOf = (error: unknown): WorkerError =>
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { name: "Error", message: String(error) };

/** Once a layout can't be applied, views may be stale, so every later task fails rather than touch memory. */
let broken: WorkerError | null = null;

const handle = async (message: ToWorker): Promise<void> => {
    if (message.kind === "memory") {
        memory = message.memory;
        return;
    }
    if (message.kind === "window") {
        runWindow(message);
        return;
    }
    if (message.kind === "layout") {
        try {
            applyLayout(message);
        }
        catch (error) {
            broken ??= errorOf(error);
        }
        return;
    }
    const buffer = createBuffer();
    const transfer: ArrayBuffer[] = [];
    try {
        if (broken !== null) throw new Error(`Worker can't run tasks after a layout failed: ${broken.message}`);
        if (message.kind === "kernels") await load(message.kernels);
        else run(message, buffer);
        self.postMessage({ kind: "done", task: message.task, commands: buffer, spawns: takeSpawns(message, transfer) } satisfies FromWorker, { transfer });
    }
    catch (error) {
        self.postMessage({ kind: "failed", task: message.task, commands: buffer, spawns: takeSpawns(message, transfer), error: errorOf(error) } satisfies FromWorker, { transfer });
    }
};

/** Handles messages strictly in order, including across a kernel load's `await`. */
let handled: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<ToWorker>): void => {
    handled = handled.then(() => handle(event.data));
};
