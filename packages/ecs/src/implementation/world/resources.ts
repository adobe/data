// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Storage } from './archetype.js';
import { indexOf, reserve } from './entities.js';
import { defaultOf, idOf, type Key, type State } from './state.js';
import { synchronizeAlone } from './synchronize.js';
import { addCommand, createBuffer, spawnCommand } from './buffer.js';
import { pushValues } from './commands.js';
import { labelOf } from '../../interface/registry/index.js';

/** Resources are components on one entity, so they share storage, ticks and sync with every other component. */
export type ResourceCell = { readonly storage: Storage; readonly row: number };

/** A resource's value before anything writes it: the one given at the world's creation, or its default. */
export const initialOf = (state: State, key: Key): unknown => state.initial.has(key) ? state.initial.get(key) : defaultOf(key);

/**
 * Adds any missing resources with their initial values, as their own sync point, between runs; commands that are
 * pending stay for the next run.
 */
export const ensureResources = (state: State, keys: Iterable<Key>): void => {
    const index = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
    const archetype = index < 0 ? undefined : state.archetypes[state.entities.archetype[index]];
    const values: { [key: Key]: unknown } = {};
    for (const key of keys) {
        const id = idOf(state, key);
        // A joined thread's object starts there; the world holds none of its values.
        if (archetype?.storageOf.has(id) !== true) values[key] = state.remote[id] === undefined ? initialOf(state, key) : state.starts[id];
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

/** Sets a resource as its own sync point, between runs, so systems see the change as they see any write. */
export const setResource = (state: State, key: Key, value: unknown): void => {
    if (findResource(state, key) === undefined) {
        // No registered system uses it yet; it starts at this value when one does.
        state.initial.set(key, value);
        return;
    }
    const buffer = createBuffer();
    pushValues(state, buffer, addCommand, state.resourceEntity, { [key]: value });
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
    if (storage === undefined) throw new Error(`Resource "${labelOf(key)}" isn't in this world.`);
    return { storage, row: state.entities.row[index] };
};
