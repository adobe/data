import type { Entity } from '../../entity/entity.js';
import type { Commands } from '../../system/commands.js';
import { locate, reserve, type Reservations } from './entities.js';
import type { Kernel, KernelModule } from './kernel.js';
import { layoutOf, viewsOf, type Layout, type TypedArray, type Views } from '../../layout/layout.js';
import { emptyViews } from './arrays.js';
import type { ArchetypeLayout, EntitiesLayout, FromWorker, KernelSetup, LookupSetup, ToWorker, WorkerError } from './protocol.js';
import { addCommand, createBuffer, despawnCommand, pushCommand, removeCommand, spawnCommand, type CommandBuffer } from './buffer.js';
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

type EntityViews = Reservations & { readonly archetype: Int32Array; readonly row: Uint32Array; readonly length: number };

type LoadedKernel = {
    readonly setup: KernelSetup;
    readonly kernel: Kernel;
    readonly wasm: WasmRun | null;
    readonly lookups: readonly ((entity: Entity) => readonly unknown[] | null)[];
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

const viewArchetype = (buffer: ArrayBufferLike, layout: ArchetypeLayout): ArchetypeViews => ({
    entities: new Float64Array(buffer, layout.entities, layout.capacity),
    storages: new Map(layout.storages.map(storage => {
        const componentLayout = layouts[storage.id];
        return [storage.id, {
            views: componentLayout.kind === "linear" && storage.column >= 0 ? viewsOf(buffer, storage.column, layout.capacity * componentLayout.stride) : emptyViews,
            added: new Float64Array(buffer, storage.added, layout.capacity),
            changed: new Float64Array(buffer, storage.changed, layout.capacity),
            chunkAdded: new Float64Array(buffer, storage.chunkAdded, storage.chunks),
            chunkChanged: new Float64Array(buffer, storage.chunkChanged, storage.chunks),
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

/** Kernels name components by `keys[k]`, which workers set to component ids, so value keys are ids. */
const pushIds = (buffer: CommandBuffer, kind: number, entity: number, values: object): void => {
    pushCommand(buffer, kind, entity);
    for (const key in values) {
        const value: unknown = Reflect.get(values, key);
        if (value === undefined) continue;
        buffer.ids.push(Number(key));
        buffer.values.push(value);
    }
};

const createCommands = (buffer: CommandBuffer): Commands => ({
    spawn: values => {
        const entity = reserve(required(entities, "layout"));
        pushIds(buffer, spawnCommand, entity, values);
        return entity;
    },
    despawn: entity => { pushCommand(buffer, despawnCommand, entity); },
    add: (entity, values) => { pushIds(buffer, addCommand, entity, values); },
    remove: (entity, ...components) => {
        pushCommand(buffer, removeCommand, entity);
        for (const component of components) {
            buffer.ids.push(Number(component));
            buffer.values.push(undefined);
        }
    },
});

const columnsOf = (loaded: LoadedKernel, archetypeId: number): readonly TypedArray[] => {
    const key = `${loaded.setup.index}:${archetypeId}`;
    const cached = columns.get(key);
    if (cached !== undefined) return cached;
    const archetype = archetypes.get(archetypeId);
    if (archetype === undefined) throw new Error(`Worker has no layout for archetype ${archetypeId}.`);
    const built = loaded.setup.sources.map(source => {
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

const run = (message: RunMessage, buffer: CommandBuffer): void => {
    const loaded = kernels.get(message.kernel);
    if (loaded === undefined) throw new Error(`Worker has no kernel ${message.kernel}.`);
    const archetype = archetypes.get(message.archetype);
    if (archetype === undefined) throw new Error(`Worker has no layout for archetype ${message.archetype}.`);
    const commands = createCommands(buffer);
    const kernelColumns = columnsOf(loaded, message.archetype);
    const filters: Filter[] = [
        ...loaded.setup.added.flatMap(id => {
            const storage = archetype.storages.get(id);
            return storage === undefined ? [] : [{ ticks: storage.added, chunks: storage.chunkAdded }];
        }),
        ...loaded.setup.changed.flatMap(id => {
            const storage = archetype.storages.get(id);
            return storage === undefined ? [] : [{ ticks: storage.changed, chunks: storage.chunkChanged }];
        }),
    ];
    const { wasm } = loaded;
    if (wasm !== null && loaded.setup.wasm !== null) {
        wasm(message.start, message.end, message.tick, message.lastRun,
            ...kernelColumns.map(column => column.byteOffset),
            ...filters.map(filter => filter.ticks.byteOffset),
            ...filters.map(filter => filter.chunks.byteOffset),
            ...scalarValues(loaded.setup.wasm.scalars, message.resources, message.args));
        return;
    }
    forEachPassingRange(filters, message.lastRun, message.start, message.end, (start, end) =>
        loaded.kernel(kernelColumns, start, end, message.resources, loaded.lookups, loaded.setup.keys, message.args, commands, message.tick));
};

const load = async (setups: readonly KernelSetup[]): Promise<void> => {
    const shared = required(memory, "memory");
    const loaded = await Promise.all(setups.map(async setup => {
        const module: KernelModule = await import(/* @vite-ignore */ setup.url);
        const wasm = setup.wasm === null ? null : await instantiateWasm(setup.wasm.module, shared, setup.wasm.imports);
        return { module, wasm };
    }));
    setups.forEach((setup, i) => kernels.set(setup.index, { setup, kernel: loaded[i].module.create(setup.booleans, setup.strides, setup.offsets), wasm: loaded[i].wasm, lookups: setup.lookups.map(createLookup) }));
};

const applyLayout = (message: Extract<ToWorker, { kind: "layout" }>): void => {
    const buffer = required(memory, "memory").buffer;
    for (const [id, schema] of message.schemas) layouts[id] = layoutOf(schema);
    entities = viewEntities(buffer, message.entities);
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
    try {
        if (broken !== null) throw new Error(`Worker can't run tasks after a layout failed: ${broken.message}`);
        if (message.kind === "kernels") await load(message.kernels);
        else run(message, buffer);
        self.postMessage({ kind: "done", task: message.task, commands: buffer } satisfies FromWorker);
    }
    catch (error) {
        self.postMessage({ kind: "failed", task: message.task, commands: buffer, error: errorOf(error) } satisfies FromWorker);
    }
};

/** Handles messages strictly in order, including across a kernel load's `await`. */
let handled: Promise<void> = Promise.resolve();
self.onmessage = (event: MessageEvent<ToWorker>): void => {
    handled = handled.then(() => handle(event.data));
};
