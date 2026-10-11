import type { Entity } from '../../entity/entity.js';
import { schemaOf } from '../../registry/create-registry.js';
import { kindOf } from '../../registry/declare-name.js';
import { createArchetype, type Archetype } from './archetype.js';
import { createEntities, type Entities } from './entities.js';
import { layoutOf, type Layout } from '../../layout/layout.js';
import { createMemory, type Memory } from './memory.js';

export type Key = string | symbol;

export type Command =
    | { readonly kind: "spawn"; readonly entity: Entity; readonly values: object }
    | { readonly kind: "despawn"; readonly entity: Entity }
    | { readonly kind: "add"; readonly entity: Entity; readonly values: object }
    | { readonly kind: "remove"; readonly entity: Entity; readonly components: readonly Key[] };

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
    /** Commands for the next sync point, in system order. */
    readonly commands: Command[];
    resourceEntity: Entity;
    /** Whether kernels with a program run as WASM, and as SIMD where they can; tests turn these off to compare with JS. */
    readonly wasm: boolean;
    readonly simd: boolean;
};

export const createState = (shared?: boolean, wasm = true, simd = true): State => {
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
        commands: [],
        resourceEntity: -1,
        wasm,
        simd,
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
    const archetype = createArchetype(state.memory, state.archetypes.length, components, state.layouts, components.some(id => state.resources.has(id)));
    state.archetypes.push(archetype);
    state.archetypeByKey.set(key, archetype);
    return archetype;
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
