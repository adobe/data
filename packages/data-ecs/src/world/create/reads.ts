import type { Entity } from '../../entity/entity.js';
import type { Archetype, Storage } from './archetype.js';
import { readCell } from './cells.js';
import { asEntity, locate } from './entities.js';
import { entriesOf, idOf, type Key, type State } from './state.js';

const operators = new Set(["==", "!=", "<", ">", "<=", ">="]);

export const equals = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
    const keys = Reflect.ownKeys(a);
    return keys.length === Reflect.ownKeys(b).length && keys.every(key => equals(Reflect.get(a, key), Reflect.get(b, key)));
};

/** Orders numbers, strings and booleans naturally, and tuples element by element. */
export const compare = (a: unknown, b: unknown): number => {
    if (Array.isArray(a) && Array.isArray(b)) {
        for (let i = 0; i < Math.min(a.length, b.length); i++) {
            const order = compare(a[i], b[i]);
            if (order !== 0) return order;
        }
        return a.length - b.length;
    }
    const left = typeof a === "boolean" ? Number(a) : a;
    const right = typeof b === "boolean" ? Number(b) : b;
    if ((typeof left === "number" && typeof right === "number") || (typeof left === "string" && typeof right === "string")) {
        return left < right ? -1 : left > right ? 1 : 0;
    }
    return 0;
};

const hasAll = (archetype: Archetype, ids: readonly number[]): boolean => {
    for (let i = 0; i < ids.length; i++) if (archetype.storageById[ids[i]] === undefined) return false;
    return true;
};

const hasAny = (archetype: Archetype, ids: readonly number[]): boolean => {
    for (let i = 0; i < ids.length; i++) if (archetype.storageById[ids[i]] !== undefined) return true;
    return false;
};

const cellAt = (archetype: Archetype, id: number, row: number): unknown => {
    const storage = archetype.storageById[id];
    return storage === undefined ? undefined : readCell(storage, row);
};

/** A `where` condition compiled once: a plain value is equality, an object of comparison operators is a comparison. */
const predicateOf = (condition: unknown): ((value: unknown) => boolean) => {
    if (typeof condition !== "object" || condition === null || Array.isArray(condition)) return value => equals(value, condition);
    const entries = Object.entries(condition);
    if (entries.length === 0 || !entries.every(([operator]) => operators.has(operator))) return value => equals(value, condition);
    const tests = entries.map(([operator, operand]): ((value: unknown) => boolean) => {
        switch (operator) {
            case "==": return value => equals(value, operand);
            case "!=": return value => !equals(value, operand);
            case "<": return typeof operand === "number" ? value => typeof value === "number" ? value < operand : compare(value, operand) < 0 : value => compare(value, operand) < 0;
            case ">": return typeof operand === "number" ? value => typeof value === "number" ? value > operand : compare(value, operand) > 0 : value => compare(value, operand) > 0;
            case "<=": return value => compare(value, operand) <= 0;
            default: return value => compare(value, operand) >= 0;
        }
    });
    return tests.length === 1 ? tests[0] : value => tests.every(test => test(value));
};

/** What `observe.select` and `observe.count` take; without `required`, every entity. */
export type QueryOptions = { readonly required?: readonly Key[]; readonly not?: readonly Key[]; readonly where?: object; readonly order?: object };

/** A query with its components resolved to ids and its `where` conditions compiled. */
export type CompiledQuery = {
    readonly required: readonly number[];
    readonly not: readonly number[];
    readonly where: readonly { readonly id: number; readonly test: (value: unknown) => boolean }[];
    readonly order: readonly { readonly id: number; readonly ascending: boolean }[];
};

/** Compiles a query once. Throws for a component without a registered schema. */
export const compileQuery = (state: State, query: QueryOptions): CompiledQuery => ({
    required: (query.required ?? []).map(key => idOf(state, key)),
    not: (query.not ?? []).map(key => idOf(state, key)),
    where: query.where === undefined ? [] : entriesOf(query.where).map(([key, condition]) => ({ id: idOf(state, key), test: predicateOf(condition) })),
    order: query.order === undefined ? [] : entriesOf(query.order).map(([key, ascending]) => ({ id: idOf(state, key), ascending: ascending !== false })),
});

/** Whether a query's entities may be in an archetype, whatever its rows. */
export const matchesArchetype = (archetype: Archetype, query: CompiledQuery): boolean =>
    !archetype.resource && hasAll(archetype, query.required) && !hasAny(archetype, query.not);

/** Reads one storage's cells; a plain number straight from its view, which can't change while a query runs. */
const readerOf = (storage: Storage | undefined): ((row: number) => unknown) => {
    if (storage === undefined) return () => undefined;
    const { layout } = storage;
    const [leaf] = layout.kind === "linear" ? layout.leaves : [];
    if (layout.kind === "linear" && layout.leaves.length === 1 && leaf.path.length === 0 && leaf.scalar !== "boolean") {
        const target = storage.views[leaf.view];
        const { unitStride, unitOffset } = leaf;
        return row => target[row * unitStride + unitOffset];
    }
    return row => readCell(storage, row);
};

/** A compiled query's `where` tests over one archetype's rows. */
const passerOf = (archetype: Archetype, query: CompiledQuery): ((row: number) => boolean) => {
    const tests = query.where.map(({ id, test }) => ({ read: readerOf(archetype.storageById[id]), test }));
    if (tests.length === 1) {
        const [{ read, test }] = tests;
        return row => test(read(row));
    }
    return row => {
        for (const { read, test } of tests) if (!test(read(row))) return false;
        return true;
    };
};

/**
 * Writes the entities a query matches into `out` from index 0, filtered by `where` and sorted by `order`, and returns
 * how many; `out` keeps any longer tail.
 */
export const selectInto = (state: State, query: CompiledQuery, out: Entity[]): number => {
    const { order } = query;
    let selected = 0;
    const keys: unknown[][] = [];
    for (const archetype of state.archetypes) {
        if (archetype.count === 0 || !matchesArchetype(archetype, query)) continue;
        const { entities } = archetype;
        const passes = query.where.length === 0 ? null : passerOf(archetype, query);
        for (let row = 0; row < archetype.count; row++) {
            if (passes !== null && !passes(row)) continue;
            out[selected++] = asEntity(entities[row]);
            if (order.length > 0) keys.push(order.map(({ id }) => cellAt(archetype, id, row)));
        }
    }
    if (order.length === 0) return selected;
    const positions = keys.map((_, i) => i);
    positions.sort((a, b) => {
        for (let i = 0; i < order.length; i++) {
            const result = compare(keys[a][i], keys[b][i]);
            if (result !== 0) return order[i].ascending ? result : -result;
        }
        return 0;
    });
    const unsorted = out.slice(0, selected);
    for (let i = 0; i < selected; i++) out[i] = unsorted[positions[i]];
    return selected;
};

/** The number of entities a query matches, without listing them. */
export const countOf = (state: State, query: CompiledQuery): number => {
    let total = 0;
    for (const archetype of state.archetypes) {
        if (archetype.count === 0 || !matchesArchetype(archetype, query)) continue;
        if (query.where.length === 0) {
            total += archetype.count;
            continue;
        }
        const passes = passerOf(archetype, query);
        for (let row = 0; row < archetype.count; row++) if (passes(row)) total++;
    }
    return total;
};

/** The components `observe.entity` takes: without them, every component the entity has. */
export type EntityOptions = { readonly required?: readonly Key[]; readonly optional?: readonly Key[] };

/** A live entity's required components and the optional ones it has, or every one without options; `null` if it's dead or lacks a required one. */
export const readEntity = (state: State, entity: Entity, options: EntityOptions | undefined): object | null => {
    const index = locate(state.entities, entity);
    if (index < 0) return null;
    const archetype = state.archetypes[state.entities.archetype[index]];
    const row = state.entities.row[index];
    const values: { [key: Key]: unknown } = {};
    if (options === undefined) {
        for (const storage of archetype.storages) values[state.keys[storage.component]] = readCell(storage, row);
        return values;
    }
    for (const key of options.required ?? []) {
        const id = state.ids.get(key);
        const storage = id === undefined ? undefined : archetype.storageById[id];
        if (storage === undefined) return null;
        values[key] = readCell(storage, row);
    }
    for (const key of options.optional ?? []) {
        const id = state.ids.get(key);
        const storage = id === undefined ? undefined : archetype.storageById[id];
        if (storage !== undefined) values[key] = readCell(storage, row);
    }
    return values;
};
