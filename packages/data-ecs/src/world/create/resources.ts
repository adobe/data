import { schemaOf } from '../../registry/create-registry.js';
import type { Storage } from './archetype.js';
import { indexOf, reserve } from './entities.js';
import { idOf, type Key, type State } from './state.js';
import { synchronizeAlone } from './synchronize.js';
import { addCommand, createBuffer, spawnCommand } from './buffer.js';
import { pushValues } from './commands.js';

/** Resources are components on one entity, so they share storage, ticks and sync with every other component. */
export type ResourceCell = { readonly storage: Storage; readonly row: number };

export const defaultOf = (key: Key): unknown => {
    const schema = schemaOf(key);
    return schema !== undefined && "default" in schema ? schema.default : undefined;
};

/**
 * Adds any missing resources with their schema defaults, as their own sync point, between runs; commands that are
 * pending stay for the next run.
 */
export const ensureResources = (state: State, keys: Iterable<Key>): void => {
    const index = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
    const archetype = index < 0 ? undefined : state.archetypes[state.entities.archetype[index]];
    const values: { [key: Key]: unknown } = {};
    for (const key of keys) {
        if (archetype?.storageOf.has(idOf(state, key)) !== true) values[key] = defaultOf(key);
    }
    if (Reflect.ownKeys(values).length === 0) return;
    const buffer = createBuffer();
    if (index < 0) {
        state.resourceEntity = reserve(state.entities);
        pushValues(state, buffer, spawnCommand, state.resourceEntity, values);
    }
    else {
        pushValues(state, buffer, addCommand, state.resourceEntity, values);
    }
    synchronizeAlone(state, buffer);
};

/** Where a resource lives now, or `undefined` if no registered system uses it. Valid until the next sync point. */
export const findResource = (state: State, key: Key): ResourceCell | undefined => {
    if (state.resourceEntity < 0) return undefined;
    const index = indexOf(state.resourceEntity);
    const storage = state.archetypes[state.entities.archetype[index]]?.storageOf.get(idOf(state, key));
    return storage === undefined ? undefined : { storage, row: state.entities.row[index] };
};

/** Where a resource lives now. Valid until the next sync point. */
export const resourceCell = (state: State, key: Key): ResourceCell => {
    const index = indexOf(state.resourceEntity);
    const archetype = state.archetypes[state.entities.archetype[index]];
    const storage = archetype?.storageOf.get(idOf(state, key));
    if (storage === undefined) throw new Error(`Resource "${String(key)}" isn't in this world.`);
    return { storage, row: state.entities.row[index] };
};
