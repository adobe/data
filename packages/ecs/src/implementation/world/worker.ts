// © 2026 Adobe. MIT License. See /LICENSE for details.
import { buildKernel, buildViews, phases, readPlan, runBuildStep } from './index-build.js';
import type { Entity } from '../../interface/entity/entity.js';
import { createBlock, endBlock, locate, reserveFrom, tableLength, type Block } from './entities.js';
import { createBatch, positionalSpawner, type Positional, type SpawnBatch } from './staging.js';
import { blockShift, chunkShift, type Kernel, type KernelCommands, type KernelModule } from './kernel.js';
import { layoutOf, viewsOf, type Layout, type TypedArray, type Views } from '../../interface/registry/layout.js';
import { emptyViews } from './arrays.js';
import { claimPiece } from './claims.js';
import { controlWords, done, epoch, idleKernel, lineWords, posted, ringBase, ringCapacity, ringCursor, ringNeeded, ringSize, signal, taskFields, taskWords, type FromWorker, type KernelSetup, type LookupSetup, type ToWorker, type WorkerError } from './protocol.js';
import { beginCommand, createRingWriter, encoderOf, endSegment, noExtent, objectStart, putComponent, putStart, putValue, startSegment, type Encoder, type Extent } from './command-ring.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import { indexParameterCount, instantiateWasm, scalarValues, type WasmRun } from './wasm.js';
import { createIndexReader, createIndexSource, sourceFromParameters, type IndexReader } from './index-readers.js';
import { coveringBuffer, pageBytes, pagesWord } from './memory.js';
import { endpointChannel, scopeChannel } from './port.js';
import {
    archetypeField, capacityField, cursorField, entitiesVersionField, entitiesWord, freeCapacityField, freeField, generationField, linearFlag,
    recordCapacity, recordEntities, recordStorages, recordVersion, recordWords, rowField, storageAdded, storageBlockAdded, storageBlockChanged, storageChanged, storageChunkAdded,
    storageChunkChanged, storageChunks, storageColumn, storageComponent, storageFlags, storageWords, tableLengthWord, tableOffsetWord, tickedFlag,
} from './layout-directory.js';

/** One storage's views in a worker. */
type StorageViews = {
    readonly views: Views;
    readonly added: Float64Array;
    readonly changed: Float64Array;
    readonly chunkAdded: Float64Array;
    readonly chunkChanged: Float64Array;
    readonly blockAdded: Float64Array;
    readonly blockChanged: Float64Array;
};

/** A worker's views of one archetype's columns, as of its record's `version`. */
type ArchetypeViews = {
    readonly version: number;
    readonly entities: Float64Array;
    readonly storages: ReadonlyMap<number, StorageViews>;
};

type EntityViews = { cursor: Int32Array; free: Int32Array; generation: Uint32Array; archetype: Int32Array; row: Uint32Array; length: number };

/** A kernel's columns, change filters and their WASM addresses in one archetype, as of `views`. */
type Bound = {
    readonly views: ArchetypeViews;
    readonly columns: readonly TypedArray[];
    readonly filters: readonly Filter[];
    /** Column addresses, then filters' tick and chunk addresses: a WASM kernel's parameters after its first four. */
    readonly addresses: readonly number[];
};

type LoadedKernel = {
    readonly setup: KernelSetup;
    readonly kernel: Kernel;
    readonly wasm: WasmRun | null;
    /** By lookup: a function by entity, or for a lookup through an index its reader, pointed at the index by each task. */
    readonly lookups: readonly unknown[];
    /** What its lookups by entity with `changed` compare with, set by each task; null for a kernel without them. */
    readonly since: Since | null;
    /** Its lookups through indexes' readers, in lookup order, with the parameters each takes. */
    readonly readers: readonly { readonly reader: IndexReader; readonly watched: number; readonly count: number }[];
    /**
     * Where its spawns are staged, one batch per set of components its lists name, with its spawners, and its commands,
     * which write into this worker's command ring; made on first run, once its components' layouts are known.
     */
    staging: { readonly batches: readonly SpawnBatch[]; readonly spawners: readonly Positional[]; readonly commands: KernelCommands } | null;
    /** By archetype id, what it ran over there, rebuilt when the archetype's record moves on. */
    readonly bound: (Bound | undefined)[];
};

let memory: WebAssembly.Memory | null = null;
/**
 * The memory's buffer, a view of it as words, for the layout directory, and views of all of it, where the command ring
 * is; rebuilt when the memory grows.
 */
let memoryBuffer: ArrayBufferLike = new ArrayBuffer(0);
let words = new Uint32Array(0);
let memoryViews: Views = emptyViews;
/** This worker's control words, its command ring's among them, and where its tasks write their segments. */
let control = new Int32Array(0);
const writer = createRingWriter();
/** By component id, how its values are written into the ring. */
const encoders: Encoder[] = [];
/** The memory's length in pages that `buffer` covers, and the header's first word. */
let pages = -1;
let header = 0;
const layouts: Layout[] = [];
/** By archetype id: its record's first word, once found in the table, and its views. */
const records: (number | undefined)[] = [];
const archetypes: (ArchetypeViews | undefined)[] = [];
let entities: EntityViews | null = null;
let entitiesVersion = -1;
const kernels = new Map<number, LoadedKernel>();

const required = <T>(value: T | null, what: string): T => {
    if (value === null) throw new Error(`Worker received a task before its ${what}.`);
    return value;
};

const errorOf = (error: unknown): WorkerError =>
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { name: "Error", message: String(error) };

/** Once views may be stale, every later task fails rather than touch memory. */
let broken: WorkerError | null = null;

/**
 * At each task's start: rebuilds the whole-buffer view once the memory grew, and marks the worker broken if its buffer
 * doesn't cover the length the world stored, since typed arrays read out of bounds as `undefined` and drop such writes.
 */
const refreshMemory = (): void => {
    if (broken !== null) throw new Error(`Worker can't run tasks after its layout failed: ${broken.message}`);
    const shared = required(memory, "memory");
    const current = Atomics.load(words, header + pagesWord);
    if (current === pages) return;
    const latest = coveringBuffer(shared, current * pageBytes);
    if (latest.byteLength < current * pageBytes) {
        broken = { name: "Error", message: `The worker's memory is ${latest.byteLength} bytes, short of the ${current * pageBytes} the world stored.` };
        throw new Error(broken.message);
    }
    memoryBuffer = latest;
    words = new Uint32Array(latest);
    memoryViews = viewsOf(latest, 0, latest.byteLength);
    pages = current;
};

/** The entity table, its views updated in place when its record moves on, since spawners hold it. */
const refreshEntities = (): EntityViews => {
    const record = header + entitiesWord;
    const version = Atomics.load(words, record + entitiesVersionField);
    if (entities === null || version !== entitiesVersion) {
        const capacity = words[record + capacityField];
        const views: EntityViews = {
            cursor: new Int32Array(memoryBuffer, words[record + cursorField], 4),
            free: new Int32Array(memoryBuffer, words[record + freeField], words[record + freeCapacityField]),
            archetype: new Int32Array(memoryBuffer, words[record + archetypeField], capacity),
            row: new Uint32Array(memoryBuffer, words[record + rowField], capacity),
            generation: new Uint32Array(memoryBuffer, words[record + generationField], capacity),
            length: 0,
        };
        if (entities === null) entities = views;
        else Object.assign(entities, views);
        entitiesVersion = version;
    }
    entities.length = entities.cursor[tableLength];
    return entities;
};

/** The tick arrays of a component without ticks. */
const noTicks = new Float64Array(0);

const viewArchetype = (record: number, version: number): ArchetypeViews => {
    const capacity = words[record + recordCapacity];
    const storages = new Map<number, StorageViews>();
    for (let s = 0; s < words[record + recordStorages]; s++) {
        const base = record + recordWords + s * storageWords;
        const component = words[base + storageComponent];
        const flags = words[base + storageFlags];
        const layout = layouts[component];
        const ticked = (flags & tickedFlag) !== 0;
        storages.set(component, {
            views: layout.kind === "linear" && (flags & linearFlag) !== 0 ? viewsOf(memoryBuffer, words[base + storageColumn], capacity * layout.stride) : emptyViews,
            added: ticked ? new Float64Array(memoryBuffer, words[base + storageAdded], capacity) : noTicks,
            changed: ticked ? new Float64Array(memoryBuffer, words[base + storageChanged], capacity) : noTicks,
            chunkAdded: ticked ? new Float64Array(memoryBuffer, words[base + storageChunkAdded], words[base + storageChunks]) : noTicks,
            chunkChanged: ticked ? new Float64Array(memoryBuffer, words[base + storageChunkChanged], words[base + storageChunks]) : noTicks,
            blockAdded: ticked ? new Float64Array(memoryBuffer, words[base + storageBlockAdded], words[base + storageChunks] << (chunkShift - blockShift)) : noTicks,
            blockChanged: ticked ? new Float64Array(memoryBuffer, words[base + storageBlockChanged], words[base + storageChunks] << (chunkShift - blockShift)) : noTicks,
        });
    }
    return { version, entities: new Float64Array(memoryBuffer, words[record + recordEntities], capacity), storages };
};

/** An archetype's views: one load of its record's version, and new views only once it moved on. */
const archetypeAt = (id: number): ArchetypeViews | undefined => {
    let record = records[id];
    if (record === undefined) {
        // Records never move, so each is found in the table once.
        const offset = id < Atomics.load(words, header + tableLengthWord) ? words[(words[header + tableOffsetWord] >> 2) + id] : 0;
        if (offset === 0) return undefined;
        record = records[id] = offset >> 2;
    }
    const version = Atomics.load(words, record + recordVersion);
    const cached = archetypes[id];
    if (cached !== undefined && cached.version === version) return cached;
    return archetypes[id] = viewArchetype(record, version);
};

const requiredArchetype = (id: number): ArchetypeViews => {
    const archetype = archetypeAt(id);
    if (archetype === undefined) throw new Error(`Worker has no layout for archetype ${id}.`);
    return archetype;
};

/** A JS kernel's lookups by entity with `changed` compare with this: the system's `lastRun`, as each task's lookup parameters end with it. */
type Since = { value: number };

/**
 * A JS kernel's lookup by entity with `changed`: one array reused, `read` values then whether a component it watches
 * may have changed after `since`; a component keeping no ticks counts as changed.
 */
const createChangedLookup = (lookup: LookupSetup, watched: readonly number[], since: Since) => {
    const values = new Array<unknown>(lookup.read.length + 1);
    return (entity: Entity): readonly unknown[] | null => {
        const table = required(entities, "entity table");
        const index = locate(table, entity);
        if (index < 0) return null;
        const archetype = archetypeAt(table.archetype[index]);
        if (archetype === undefined) return null;
        for (const id of lookup.read) if (!archetype.storages.has(id)) return null;
        for (const id of lookup.has) if (!archetype.storages.has(id)) return null;
        for (const id of lookup.not) if (archetype.storages.has(id)) return null;
        const row = table.row[index];
        const { read } = lookup;
        for (let i = 0; i < read.length; i++) {
            const layout = layouts[read[i]];
            const storage = archetype.storages.get(read[i]);
            values[i] = layout.kind === "linear" && storage !== undefined ? layout.read(storage.views, row) : layout.kind === "constant" ? layout.value : undefined;
        }
        let changed = since.value < 0;
        for (let i = 0; i < watched.length && !changed; i++) {
            const ticks = archetype.storages.get(watched[i])?.changed;
            changed = ticks === undefined || ticks.length === 0 || ticks[row] > since.value;
        }
        values[read.length] = changed;
        return values;
    };
};

const createLookup = (lookup: LookupSetup) => (entity: Entity): readonly unknown[] | null => {
    const table = required(entities, "entity table");
    const index = locate(table, entity);
    if (index < 0) return null;
    const archetype = archetypeAt(table.archetype[index]);
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

/** An archetype as an index reader reads its rows: its entities and columns, from the layout directory. */
const readerArchetype = (id: number) => {
    const archetype = archetypeAt(id);
    return archetype === undefined ? undefined : { version: archetype.version, entities: archetype.entities, column: (component: number, view: keyof Views) => archetype.storages.get(component)?.views[view] };
};

/** The one element a muted tick column's stores land on. */
const mutedColumn = new Float64Array(1);

/** A kernel's change filters in an archetype: `added` then `changed`, rows, chunks and blocks. */
const filtersOf = (loaded: LoadedKernel, archetype: ArchetypeViews): Filter[] => [
    ...loaded.setup.added.flatMap(id => {
        const storage = archetype.storages.get(id);
        return storage === undefined ? [] : [{ ticks: storage.added, chunks: storage.chunkAdded, blocks: storage.blockAdded }];
    }),
    ...loaded.setup.changed.flatMap(id => {
        const storage = archetype.storages.get(id);
        return storage === undefined ? [] : [{ ticks: storage.changed, chunks: storage.chunkChanged, blocks: storage.blockChanged }];
    }),
];

const bind = (loaded: LoadedKernel, archetypeId: number, archetype: ArchetypeViews): Bound => {
    const columns = loaded.setup.sources.map((source, k) => {
        if (loaded.setup.muted[k]) return mutedColumn;
        if (source.kind === "entity") return archetype.entities;
        const storage = archetype.storages.get(source.id);
        if (storage === undefined) throw new Error(`Archetype ${archetypeId} lacks component ${source.id}.`);
        if (source.kind === "changed") return storage.changed;
        if (source.kind === "chunks") return storage.chunkChanged;
        if (source.kind === "blocks") return storage.blockChanged;
        const layout = layouts[source.id];
        if (layout.kind !== "linear") throw new Error(`Component ${source.id} isn't linear.`);
        return storage.views[layout.leaves[source.leaf].view];
    });
    const filters = filtersOf(loaded, archetype);
    const addresses = [...columns.map(column => column.byteOffset), ...filters.map(filter => filter.ticks.byteOffset), ...filters.map(filter => filter.chunks.byteOffset), ...filters.map(filter => filter.blocks.byteOffset)];
    return { views: archetype, columns, filters, addresses };
};

/** What a kernel runs over in an archetype, kept until the archetype's record moves on. */
const boundOf = (loaded: LoadedKernel, archetypeId: number): Bound => {
    const archetype = requiredArchetype(archetypeId);
    const cached = loaded.bound[archetypeId];
    if (cached !== undefined && cached.views === archetype) return cached;
    return loaded.bound[archetypeId] = bind(loaded, archetypeId, archetype);
};

type RunMessage = Extract<ToWorker, { kind: "run" }>;

const noPartials = new Float64Array(0);

/** This worker's reservations for kernel spawns, in blocks, so workers spawning together don't contend; ended by each task. */
let block: Block | null = null;

const encoderFor = (id: number): Encoder => encoders[id] ??= encoderOf(layouts[id]);

/** A kernel's staging and commands, made once its components' layouts are known. */
const stagingOf = (loaded: LoadedKernel): NonNullable<LoadedKernel["staging"]> => {
    if (loaded.staging !== null) return loaded.staging;
    const reserving = block ??= createBlock(required(entities, "entity table"));
    const batches: SpawnBatch[] = [];
    const { keys, starts } = loaded.setup;
    const spawners = loaded.setup.spawns.map(ids => {
        const key = [...ids].sort((a, b) => a - b).join(",");
        let batch = batches.find(candidate => candidate.ids.join(",") === key);
        if (batch === undefined) batches.push(batch = createBatch(layouts, ids));
        // An object's or a string's start is the world's to resolve.
        return positionalSpawner(reserving, reserveFrom, batch, ids, ids.map(id => layouts[id].kind === "object" || layouts[id].kind === "string" ? objectStart : starts[keys.indexOf(id)]));
    });
    const valueEncoders = keys.map(encoderFor);
    const commands: KernelCommands = {
        spawners,
        begin: (kind, entity) => beginCommand(writer, kind, entity),
        value: (key, value) => value === undefined ? putStart(writer, keys[key]) : putValue(writer, keys[key], valueEncoders[key], value),
        component: key => putComponent(writer, keys[key]),
    };
    return loaded.staging = { batches, spawners, commands };
};

/** Reservation positions this worker's block left unused, reused by each task. */
const unused: number[] = [];

const noBatches: readonly SpawnBatch[] = [];

/** Writes a run's segment: its commands, its staged spawn batches, in batch order, emptying them, then the reservations its block left unused. */
const writeSegment = (message: RunMessage): Extent => {
    unused.length = 0;
    if (block !== null) endBlock(block, unused);
    const staging = kernels.get(message.kernel)?.staging ?? null;
    return endSegment(writer, memoryViews, Atomics.load(control, ringBase) >>> 0, Atomics.load(control, ringCapacity), Atomics.load(control, ringCursor), staging?.batches ?? noBatches, unused);
};

const run = (message: RunMessage): void => {
    const loaded = kernels.get(message.kernel);
    if (loaded === undefined) throw new Error(`Worker has no kernel ${message.kernel}.`);
    refreshEntities();
    const { columns, filters, addresses } = boundOf(loaded, message.archetype);
    const { commands } = stagingOf(loaded);
    const { wasm } = loaded;
    if (wasm !== null && loaded.setup.wasm !== null) {
        wasm(message.start, message.end, message.tick, message.lastRun, ...addresses, ...message.lookups, ...message.indexes,
            ...scalarValues(loaded.setup.wasm.scalars, message.resources, message.args),
            ...message.partials < 0 ? [] : [message.partials]);
        return;
    }
    const partials = message.partials < 0 ? noPartials : new Float64Array(memoryBuffer, message.partials);
    // A kernel watching through lookups by entity gets its `lastRun` last among the lookup parameters.
    if (loaded.since !== null) loaded.since.value = message.lookups[message.lookups.length - 1] ?? 0;
    // Lookups through indexes read the index where the task's parameters say it is now.
    let at = 0;
    for (const { reader, watched, count } of loaded.readers) {
        sourceFromParameters(reader.source, memoryViews, message.indexes, at, watched);
        at += count;
    }
    forEachPassingRange(filters, message.lastRun, message.start, message.end, (start, end) =>
        loaded.kernel(columns, start, end, message.resources, loaded.lookups, loaded.setup.keys, message.args, commands, message.tick, partials, 0));
};

const load = async (setups: readonly KernelSetup[]): Promise<void> => {
    const shared = required(memory, "memory");
    const loaded = await Promise.all(setups.map(async setup => {
        const module: KernelModule = await import(/* @vite-ignore */ setup.url);
        const wasm = setup.wasm === null ? null : await instantiateWasm(setup.wasm.module, shared, setup.wasm.imports);
        return { module, wasm };
    }));
    // A kernel loaded again binds its columns again, since they may differ, such as muted ones now stamped.
    setups.forEach((setup, i) => {
        const readers = setup.indexes.map(({ lookup, reader, watched }) => ({
            lookup,
            reader: createIndexReader(reader, createIndexSource(reader.kind), readerArchetype),
            watched,
            count: indexParameterCount({ kind: reader.kind, words: reader.words, stride: reader.stride, probe: () => null, rowLeaf: () => null, watched }),
        }));
        const since: Since | null = setup.lookups.some(lookup => lookup.changed !== null) ? { value: 0 } : null;
        const lookups = setup.lookups.map((lookup, k): unknown => readers.find(found => found.lookup === k)?.reader
            ?? (lookup.changed === null || since === null ? createLookup(lookup) : createChangedLookup(lookup, lookup.changed, since)));
        kernels.set(setup.index, { since, setup, kernel: loaded[i].module.create(setup.booleans, setup.strides.map((stride, k) => setup.muted[k] ? 0 : stride), setup.offsets.map((offset, k) => setup.muted[k] ? 0 : offset), setup.up.booleans, setup.up.strides, setup.up.offsets), wasm: loaded[i].wasm, lookups, readers, staging: null, bound: [] });
    });
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
    const parameters = [...boundOf(loaded, archetypeId).addresses, ...scalars];
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

/** Runs a build step's task (`index-build.ts`): its phase over the pieces or partitions it claims, or its even share. */
const runBuildTask = (payloads: Float64Array, base: number, buffer: ArrayBufferLike, message: Extract<ToWorker, { kind: "window" }>): void => {
    const views = buildViews(memoryBuffer);
    const plan = readPlan(views.f64, payloads[base + taskFields]);
    const phase = phases[payloads[base + 1]];
    const start = payloads[base + 2];
    const end = payloads[base + 3];
    const line = payloads[base + 8];
    const grain = payloads[base + 9];
    if (line < 0) return runBuildStep(views, plan, phase, start, end);
    const participants = payloads[base + 11];
    const words = new Int32Array(buffer, message.claims + line * lineWords * 4, participants * lineWords);
    const self = payloads[base + 10];
    for (let piece = claimPiece(words, self, participants); piece >= 0; piece = claimPiece(words, self, participants)) {
        runBuildStep(views, plan, phase, start + piece * grain, Math.min(end, start + (piece + 1) * grain));
    }
};

/**
 * Runs tasks from this worker's ring in shared memory, blocking between them, until the main thread asks it to leave;
 * then it returns to handling messages.
 */
const runWindow = (message: Extract<ToWorker, { kind: "window" }>): void => {
    const buffer = required(memory, "memory").buffer;
    // The pool's control state never moves, so these views last the window.
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
                refreshMemory();
                const kernel = payloads[base];
                if (kernel === buildKernel) runBuildTask(payloads, base, buffer, message);
                else if (kernel !== idleKernel) {
                    const loaded = kernels.get(kernel);
                    if (loaded === undefined) throw new Error("Worker can't run this task.");
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
        // Closed, it leaves once it ran this window's tasks: the pool posts a task before it closes the window, so a task
        // posted since the check above is seen now, and runs above if it's this window's.
        if (Atomics.load(control, epoch) !== message.epoch) {
            if (next < Atomics.load(control, posted)) continue;
            return;
        }
        // Tiers follow each other closely, so spin briefly before paying for a blocking wait's wake-up.
        const deadline = performance.now() + 0.05;
        while (Atomics.load(control, signal) === seen && performance.now() < deadline);
        if (Atomics.load(control, signal) === seen) Atomics.wait(control, signal, seen);
    }
};

/** Where messages come from and replies go: this worker's own scope, until a lent worker's owner gives it a port. */
let channel = scopeChannel<FromWorker, ToWorker>();

const handle = async (message: ToWorker): Promise<void> => {
    if (message.kind === "port") {
        channel = endpointChannel(message.port);
        channel.onMessage(receive);
        return;
    }
    if (message.kind === "memory") {
        memory = message.memory;
        header = message.header >> 2;
        memoryBuffer = memory.buffer;
        words = new Uint32Array(memoryBuffer);
        memoryViews = viewsOf(memoryBuffer, 0, memoryBuffer.byteLength);
        control = new Int32Array(memoryBuffer, message.control, controlWords);
        return;
    }
    if (message.kind === "window") {
        runWindow(message);
        return;
    }
    if (message.kind === "layout") {
        try {
            for (const [id, schema] of message.schemas) layouts[id] = layoutOf(schema);
        }
        catch (error) {
            broken ??= errorOf(error);
        }
        return;
    }
    if (message.kind === "tables") {
        channel.post({ kind: "tables", task: message.task, kernels: kernels.size });
        return;
    }
    if (message.kind === "kernels") {
        try {
            refreshMemory();
            await load(message.kernels);
            channel.post({ kind: "done", task: message.task, start: 0, end: 0, spill: null });
        }
        catch (error) {
            channel.post({ kind: "failed", task: message.task, start: 0, end: 0, spill: null, error: errorOf(error) });
        }
        return;
    }
    let failure: unknown = undefined;
    let segment = false;
    try {
        refreshMemory();
        startSegment(writer, message);
        segment = true;
        run(message);
    }
    catch (error) {
        failure = error;
    }
    // What a failed task issued before failing still applies, its spawns included.
    let extent = noExtent;
    if (segment) {
        try {
            extent = writeSegment(message);
        }
        catch (error) {
            failure ??= error;
        }
    }
    const { start, end, spill, transfer: spilled } = extent;
    if (extent !== noExtent) {
        Atomics.store(control, ringCursor, end);
        Atomics.store(control, ringNeeded, Atomics.load(control, ringNeeded) + end - start + (spill?.length ?? 0));
    }
    const transfer = spilled === null ? noTransfer : [spilled];
    if (failure === undefined) channel.post({ kind: "done", task: message.task, start, end, spill }, transfer);
    else channel.post({ kind: "failed", task: message.task, start, end, spill, error: errorOf(failure) }, transfer);
};

const noTransfer: ArrayBuffer[] = [];

/** Handles messages strictly in order, including across a kernel load's `await`. */
let handled: Promise<void> = Promise.resolve();
const receive = (message: ToWorker): void => {
    handled = handled.then(() => handle(message));
};
channel.onMessage(receive);
