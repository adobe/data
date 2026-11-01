// © 2026 Adobe. MIT License. See /LICENSE for details.
import { readCell } from './cells.js';
import { indexOf } from './entities.js';
import type { Storage } from './archetype.js';
import type { State } from './state.js';

/** A watched resource written to a value that isn't equal to the one its finalizers last saw. */
export type ResourceChange = { readonly id: number; readonly previous: unknown; readonly next: unknown };

const noChanges: readonly ResourceChange[] = [];

/** Where resource `id` lives now, or null before the world has it. */
const cellOf = (state: State, id: number): { readonly storage: Storage; readonly row: number } | null => {
    if (state.resourceEntity < 0) return null;
    const index = indexOf(state.resourceEntity);
    const storage = state.archetypes[state.entities.archetype[index]]?.storageById[id];
    return storage === undefined ? null : { storage, row: state.entities.row[index] };
};

/** Starts following resource `id` for a changes finalizer watching it, from its value now. */
export const watchResource = (state: State, id: number): void => {
    if (state.resourcesSeen.has(id)) return;
    const cell = cellOf(state, id);
    state.resourcesSeen.set(id, cell === null ? { value: state.starts[id], tick: 0 } : { value: readCell(cell.storage, cell.row), tick: cell.storage.changed[cell.row] });
};

/** Whether a watched resource was written since its finalizers last ran, so a sync point is due for them to see it. */
export const resourcesWritten = (state: State): boolean => {
    for (const [id, seen] of state.resourcesSeen) {
        const cell = cellOf(state, id);
        if (cell !== null && cell.storage.changed[cell.row] > seen.tick) return true;
    }
    return false;
};

/**
 * Each watched resource written since its finalizers last ran, to a value that isn't equal to the one they saw then,
 * with that value and its value now, which they see from now on.
 */
export const takeResourceChanges = (state: State): readonly ResourceChange[] => {
    let changes: ResourceChange[] | null = null;
    for (const [id, seen] of state.resourcesSeen) {
        const cell = cellOf(state, id);
        if (cell === null) continue;
        const tick = cell.storage.changed[cell.row];
        if (tick <= seen.tick) continue;
        const next = readCell(cell.storage, cell.row);
        if (!sameValue(seen.value, next)) (changes ??= []).push({ id, previous: seen.value, next });
        state.resourcesSeen.set(id, { value: next, tick });
    }
    return changes ?? noChanges;
};

const isPlain = (value: object): boolean => {
    const prototype: unknown = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

/** Whether two values are equal: data leaf by leaf, as `Object.is` compares leaves, and any other object by identity. */
export const sameValue = (a: unknown, b: unknown): boolean => {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, i) => sameValue(item, b[i]));
    if (Array.isArray(b) || !isPlain(a) || !isPlain(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(Reflect.get(a, key), Reflect.get(b, key)));
};
