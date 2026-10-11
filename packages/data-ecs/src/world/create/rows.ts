import type { Entity } from '../../entity/entity.js';
import type { Declaration } from '../../system/declaration.js';
import type { Lookup } from '../../system/query.js';
import type { Archetype } from './archetype.js';
import { readCell, writeCell } from './cells.js';
import { locate } from './entities.js';
import { resourceCell } from './resources.js';
import { idOf, type Key, type State } from './state.js';

/** Selects the row an accessor row reads and writes. */
export type Cursor = { row: number };

/**
 * A row with accessors for the declared components of one archetype. Reads copy linear values out;
 * writes replace the whole value and stamp `changed` with the running system's tick.
 */
export const createRow = (state: State, archetype: Archetype, reads: readonly Key[], writes: readonly Key[], cursor: Cursor): object => {
    const row = {};
    Object.defineProperty(row, "entity", { get: () => archetype.entities[cursor.row], enumerable: true });
    for (const key of new Set([...reads, ...writes])) {
        const storage = archetype.storageOf.get(idOf(state, key));
        if (storage === undefined) continue;
        Object.defineProperty(row, key, {
            get: () => readCell(storage, cursor.row),
            set: writes.includes(key) ? (value: unknown) => {
                writeCell(storage, cursor.row, value);
                storage.changed[cursor.row] = state.tick;
            } : undefined,
            enumerable: true,
        });
    }
    return row;
};

/** The archetype of a live entity that matches a lookup, or `null`. */
const matching = (state: State, lookup: Lookup, entity: Entity): { readonly archetype: Archetype; readonly row: number } | null => {
    const index = locate(state.entities, entity);
    if (index < 0) return null;
    const archetype = state.archetypes[state.entities.archetype[index]];
    if (archetype.resource) return null;
    for (const key of lookup.read ?? []) if (!archetype.storageOf.has(idOf(state, key))) return null;
    for (const key of lookup.has ?? []) if (!archetype.storageOf.has(idOf(state, key))) return null;
    for (const key of lookup.not ?? []) if (archetype.storageOf.has(idOf(state, key))) return null;
    return { archetype, row: state.entities.row[index] };
};

const valueOf = (state: State, archetype: Archetype, row: number, key: Key): unknown => {
    const storage = archetype.storageOf.get(idOf(state, key));
    return storage === undefined ? undefined : readCell(storage, row);
};

/** A lookup returning `read` values keyed by component, for main-thread systems. */
export const createObjectLookup = (state: State, lookup: Lookup) => (entity: Entity): object | null => {
    const found = matching(state, lookup, entity);
    if (found === null) return null;
    const values: { [key: Key]: unknown } = {};
    for (const key of lookup.read ?? []) values[key] = valueOf(state, found.archetype, found.row, key);
    return values;
};

/** A lookup returning `read` values in declared order, for kernels. */
export const createArrayLookup = (state: State, lookup: Lookup) => (entity: Entity): readonly unknown[] | null => {
    const found = matching(state, lookup, entity);
    return found === null ? null : (lookup.read ?? []).map(key => valueOf(state, found.archetype, found.row, key));
};

/** Lookups, resources and `args` in one object. Resource accessors resolve the resource on each access. */
export const createContext = (state: State, declaration: Declaration): { args?: unknown } => {
    const context: { args?: unknown } = {};
    const { lookup, resources } = declaration;
    for (const name in lookup) Object.defineProperty(context, name, { value: createObjectLookup(state, lookup[name]), enumerable: true });
    const writes = resources?.write ?? [];
    for (const key of new Set([...resources?.read ?? [], ...writes])) {
        Object.defineProperty(context, key, {
            get: () => {
                const { storage, row } = resourceCell(state, key);
                return readCell(storage, row);
            },
            set: writes.includes(key) ? (value: unknown) => {
                const { storage, row } = resourceCell(state, key);
                writeCell(storage, row, value);
                storage.changed[row] = state.tick;
            } : undefined,
            enumerable: true,
        });
    }
    return context;
};
