import type { Entity } from '../../entity/entity.js';
import type { Declaration } from '../../system/declaration.js';
import type { Lookup } from '../../system/query.js';
import { stampChanged, type Archetype } from './archetype.js';
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
        const { layout } = storage;
        Object.defineProperty(row, key, {
            // Chosen once per storage, so a read doesn't dispatch on the layout.
            get: layout.kind === "linear" ? () => layout.read(storage.views, cursor.row)
                : layout.kind === "object" ? () => storage.values[cursor.row]
                : () => layout.value,
            set: writes.includes(key) ? (value: unknown) => {
                writeCell(storage, cursor.row, value);
                stampChanged(storage, cursor.row, state.tick);
            } : undefined,
            enumerable: true,
        });
    }
    return row;
};

/**
 * A lookup's matcher, with its component ids resolved once. `find` returns the row of a live entity that matches, or -1,
 * leaving its archetype in `archetype`.
 */
const createMatcher = (state: State, lookup: Lookup) => {
    const ids = (keys: readonly Key[] | undefined): number[] => (keys ?? []).map(key => idOf(state, key));
    const read = ids(lookup.read);
    const has = ids(lookup.has);
    const not = ids(lookup.not);
    const matcher = {
        read,
        archetype: null as Archetype | null,
        find: (entity: Entity): number => {
            const index = locate(state.entities, entity);
            if (index < 0) return -1;
            const archetype = state.archetypes[state.entities.archetype[index]];
            if (archetype.resource) return -1;
            const { storageById } = archetype;
            for (let i = 0; i < read.length; i++) if (storageById[read[i]] === undefined) return -1;
            for (let i = 0; i < has.length; i++) if (storageById[has[i]] === undefined) return -1;
            for (let i = 0; i < not.length; i++) if (storageById[not[i]] !== undefined) return -1;
            matcher.archetype = archetype;
            return state.entities.row[index];
        },
    };
    return matcher;
};

const readAt = (archetype: Archetype, row: number, id: number): unknown => {
    const storage = archetype.storageById[id];
    return storage === undefined ? undefined : readCell(storage, row);
};

/** A lookup returning `read` values keyed by component, for main-thread systems. */
export const createObjectLookup = (state: State, lookup: Lookup) => {
    const matcher = createMatcher(state, lookup);
    const keys = lookup.read ?? [];
    return (entity: Entity): object | null => {
        const row = matcher.find(entity);
        const { archetype } = matcher;
        if (row < 0 || archetype === null) return null;
        const values: { [key: Key]: unknown } = {};
        for (let i = 0; i < keys.length; i++) values[keys[i]] = readAt(archetype, row, matcher.read[i]);
        return values;
    };
};

/** A lookup returning `read` values in declared order, for kernels. */
export const createArrayLookup = (state: State, lookup: Lookup) => {
    const matcher = createMatcher(state, lookup);
    const { read } = matcher;
    return (entity: Entity): readonly unknown[] | null => {
        const row = matcher.find(entity);
        const { archetype } = matcher;
        if (row < 0 || archetype === null) return null;
        const values = new Array<unknown>(read.length);
        for (let i = 0; i < read.length; i++) values[i] = readAt(archetype, row, read[i]);
        return values;
    };
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
                stampChanged(storage, row, state.tick);
            } : undefined,
            enumerable: true,
        });
    }
    return context;
};
