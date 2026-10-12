import type { Entity } from '../../entity/entity.js';
import { schemaOf } from '../../registry/create-registry.js';
import { kindOf } from '../../registry/declare-name.js';
import { createArchetype, startTicks, type Archetype, type Storage } from './archetype.js';
import type { Shape, SpawnBatch } from './batches.js';
import type { Directory } from './directories.js';
import type { GpuEngine } from './gpu.js';
import type { Queued } from './synchronize.js';
import { createEntities, type Entities } from './entities.js';
import { layoutOf, type Layout } from '../../layout/layout.js';
import { createMemory, type Memory } from './memory.js';
import type { Row } from './rows.js';

export type Key = string | symbol;

/** Everything a world stores. Components and resources share ids; resources live on `resourceEntity`. */
export type State = {
    readonly memory: Memory;
    readonly entities: Entities;
    readonly archetypes: Archetype[];
    readonly archetypeByKey: Map<string, Archetype>;
    readonly ids: Map<Key, number>;
    readonly keys: Key[];
    readonly layouts: Layout[];
    readonly resources: Set<number>;
    /** The newest tick handed out. Systems and sync points each take the next one. */
    tick: number;
    /** Command buffers for the next sync point, in merge order. */
    readonly queued: Queued[];
    resourceEntity: Entity;
    /** Components some registered system filters on with `changed`; only their kernel stamps are kept. */
    readonly observed: Set<number>;
    /** Components some registered system filters on with `added` or `changed`; only they keep ticks. */
    readonly ticked: Set<number>;
    /** Main-thread spawns since the last sync point, by component set; `spawnShapes` caches key lists resolved to them. */
    readonly batches: SpawnBatch[];
    readonly batchByKey: Map<string, SpawnBatch>;
    readonly spawnShapes: Shape[];
    nextShape: number;
    /** Lookup directories for WASM kernels, kept up to date at sync points. */
    readonly directories: Set<Directory>;
    /** Workers the world may run kernels on; with none, kernels run on the main thread. */
    workers: number;
    /** Called at the end of each sync point, to size what depends on archetypes, such as reduction partials. */
    readonly afterSync: Set<() => void>;
    /** Accessor rows for main-thread systems, by the component ids they read and write. */
    readonly rows: Map<string, Row>;
    /** Whether kernels with a program run as WASM, and as SIMD where they can; tests turn these off to compare with JS. */
    readonly wasm: boolean;
    readonly simd: boolean;
    /** The world's GPU, where render systems and GPU kernels run. */
    gpu: GpuEngine | null;
    /** With a GPU: archetypes the current sync point changed, whose GPU copies are then out of date. */
    readonly touched: Set<Archetype> | null;
};

export const createState = (shared?: boolean, wasm = true, simd = true, gpu = false): State => {
    const memory = createMemory(shared);
    return {
        memory,
        entities: createEntities(memory),
        archetypes: [],
        archetypeByKey: new Map(),
        ids: new Map(),
        keys: [],
        layouts: [],
        resources: new Set(),
        tick: 0,
        queued: [],
        resourceEntity: -1,
        observed: new Set(),
        ticked: new Set(),
        batches: [],
        batchByKey: new Map(),
        spawnShapes: [],
        nextShape: 0,
        directories: new Set(), workers: 0, afterSync: new Set(),
        rows: new Map(),
        wasm,
        simd,
        gpu: null,
        touched: gpu ? new Set() : null,
    };
};

/** The id of a component or resource. Throws if it has no registered schema. */
export const idOf = (state: State, key: Key): number => {
    const existing = state.ids.get(key);
    if (existing !== undefined) return existing;
    const schema = schemaOf(key);
    if (schema === undefined) throw new Error(`"${String(key)}" has no registered schema; import the module that registers it.`);
    const id = state.keys.length;
    state.ids.set(key, id);
    state.keys.push(key);
    state.layouts.push(layoutOf(schema));
    if (kindOf(key) === "resource") state.resources.add(id);
    return id;
};

/** The archetype for sorted component ids, created if needed. Creation allocates, so it happens only at sync points. */
export const archetypeOf = (state: State, components: readonly number[]): Archetype => {
    const key = components.join(",");
    const existing = state.archetypeByKey.get(key);
    if (existing !== undefined) return existing;
    const archetype = createArchetype(state.memory, state.archetypes.length, components, state.layouts, components.some(id => state.resources.has(id)), state.ticked);
    state.archetypes.push(archetype);
    state.archetypeByKey.set(key, archetype);
    return archetype;
};

/** Starts keeping ticks for components, in every archetype. Allocates, so it runs only between runs. */
export const startTicking = (state: State, components: readonly number[]): void => {
    for (const id of components) {
        if (state.ticked.has(id)) continue;
        state.ticked.add(id);
        for (const archetype of state.archetypes) {
            const storage = archetype.storageById[id];
            if (storage !== undefined) startTicks(state.memory, archetype, storage, state.tick);
        }
    }
};

/** The archetype with `id` added, through a cached edge. Creating one allocates, so this runs only at sync points. */
export const withComponent = (state: State, archetype: Archetype, id: number): Archetype => {
    if (archetype.storageById[id] !== undefined) return archetype;
    let next = archetype.adding[id];
    if (next === undefined) {
        next = archetypeOf(state, [...archetype.components, id].sort((a, b) => a - b));
        archetype.adding[id] = next;
    }
    return next;
};

export const withoutComponent = (state: State, archetype: Archetype, id: number): Archetype => {
    if (archetype.storageById[id] === undefined) return archetype;
    let next = archetype.removing[id];
    if (next === undefined) {
        next = archetypeOf(state, archetype.components.filter(component => component !== id));
        archetype.removing[id] = next;
    }
    return next;
};

/** The storages two archetypes share, as source and target pairs, cached per pair. */
export const movesOf = (from: Archetype, to: Archetype): readonly Storage[] => {
    let moves = from.moves[to.id];
    if (moves === undefined) {
        moves = to.storages.flatMap(storage => {
            const source = from.storageById[storage.component];
            return source === undefined ? [] : [source, storage];
        });
        from.moves[to.id] = moves;
    }
    return moves;
};

/** Own string and symbol keys whose value isn't `undefined`. */
export const entriesOf = (values: object): [Key, unknown][] => {
    const entries: [Key, unknown][] = [];
    for (const key of Reflect.ownKeys(values)) {
        const value: unknown = Reflect.get(values, key);
        if (value !== undefined) entries.push([key, value]);
    }
    return entries;
};
