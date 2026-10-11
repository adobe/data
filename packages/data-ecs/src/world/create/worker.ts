import type { Entity } from '../../entity/entity.js';
import type { Commands } from '../../system/commands.js';
import { locate, reserve, type Reservations } from './entities.js';
import type { Kernel, KernelModule } from './kernel.js';
import { layoutOf, leafView, type Layout, type TypedArray } from './layout.js';
import type { ArchetypeLayout, EntitiesLayout, FromWorker, KernelSetup, LookupSetup, ToWorker, WorkerCommand, WorkerError } from './protocol.js';
import { forEachPassingRange } from './ranges.js';

/** A worker's views of one archetype's columns in the shared memory. */
type ArchetypeViews = {
    readonly entities: Float64Array;
    readonly storages: ReadonlyMap<number, { readonly fields: readonly TypedArray[]; readonly added: Float64Array; readonly changed: Float64Array }>;
};

type EntityViews = Reservations & { readonly archetype: Int32Array; readonly row: Uint32Array; readonly length: number };

type LoadedKernel = { readonly setup: KernelSetup; readonly kernel: Kernel; readonly lookups: readonly ((entity: Entity) => readonly unknown[] | null)[] };

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
        const leaves = componentLayout.kind === "linear" ? componentLayout.leaves : [];
        return [storage.id, {
            fields: storage.fields.map((offset, i) => leafView(buffer, leaves[i].scalar, offset, layout.capacity)),
            added: new Float64Array(buffer, storage.added, layout.capacity),
            changed: new Float64Array(buffer, storage.changed, layout.capacity),
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
        return layout.kind === "linear" && storage !== undefined ? layout.read(storage.fields, row) : layout.kind === "constant" ? layout.value : undefined;
    });
};

const createCommands = (buffer: WorkerCommand[]): Commands => ({
    // Kernels name components by `keys[k]`, which workers set to component ids, so value keys are ids.
    spawn: values => {
        const entity = reserve(required(entities, "layout"));
        buffer.push({ kind: "spawn", entity, values: { ...values } });
        return entity;
    },
    despawn: entity => { buffer.push({ kind: "despawn", entity }); },
    add: (entity, values) => { buffer.push({ kind: "add", entity, values: { ...values } }); },
    remove: (entity, ...components) => { buffer.push({ kind: "remove", entity, components: components.map(Number) }); },
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
        return source.kind === "changed" ? storage.changed : storage.fields[source.leaf];
    });
    columns.set(key, built);
    return built;
};

type RunMessage = Extract<ToWorker, { kind: "run" }>;

const run = (message: RunMessage, buffer: WorkerCommand[]): void => {
    const loaded = kernels.get(message.kernel);
    if (loaded === undefined) throw new Error(`Worker has no kernel ${message.kernel}.`);
    const archetype = archetypes.get(message.archetype);
    if (archetype === undefined) throw new Error(`Worker has no layout for archetype ${message.archetype}.`);
    const commands = createCommands(buffer);
    const kernelColumns = columnsOf(loaded, message.archetype);
    const ticks = (ids: readonly number[], kind: "added" | "changed"): Float64Array[] =>
        ids.map(id => archetype.storages.get(id)?.[kind] ?? new Float64Array(0));
    forEachPassingRange(ticks(loaded.setup.added, "added"), ticks(loaded.setup.changed, "changed"), message.lastRun, message.start, message.end, (start, end) =>
        loaded.kernel(kernelColumns, start, end, message.resources, loaded.lookups, loaded.setup.keys, message.args, commands, message.tick));
};

const load = async (setups: readonly KernelSetup[]): Promise<void> => {
    const modules = await Promise.all(setups.map(async setup => {
        const module: KernelModule = await import(/* @vite-ignore */ setup.url);
        return module;
    }));
    setups.forEach((setup, i) => kernels.set(setup.index, { setup, kernel: modules[i].create(setup.booleans), lookups: setup.lookups.map(createLookup) }));
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
    const buffer: WorkerCommand[] = [];
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
