import type { Entity } from '../../entity/entity.js';
import type { Archetype } from './archetype.js';
import { readCell } from './cells.js';
import { locate } from './entities.js';
import { entriesOf, type Key, type State } from './state.js';

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

/** Component ids, or -1 for a key no archetype in this world has. */
const idsOf = (state: State, keys: readonly Key[]): number[] => keys.map(key => state.ids.get(key) ?? -1);

const hasAll = (archetype: Archetype, ids: readonly number[]): boolean => {
    for (let i = 0; i < ids.length; i++) if (ids[i] < 0 || archetype.storageById[ids[i]] === undefined) return false;
    return true;
};

const hasAny = (archetype: Archetype, ids: readonly number[]): boolean => {
    for (let i = 0; i < ids.length; i++) if (ids[i] >= 0 && archetype.storageById[ids[i]] !== undefined) return true;
    return false;
};

const cellAt = (archetype: Archetype, id: number, row: number): unknown => {
    const storage = id < 0 ? undefined : archetype.storageById[id];
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

type Options = { readonly not?: readonly Key[]; readonly where?: object; readonly order?: object };

type Compiled = {
    readonly include: readonly number[];
    readonly not: readonly number[];
    readonly where: readonly { readonly id: number; readonly test: (value: unknown) => boolean }[];
};

const compile = (state: State, include: readonly Key[], options: Options): Compiled => ({
    include: idsOf(state, include),
    not: idsOf(state, options.not ?? []),
    where: options.where === undefined ? [] : entriesOf(options.where).map(([key, condition]) => ({ id: state.ids.get(key) ?? -1, test: predicateOf(condition) })),
});

const matches = (archetype: Archetype, compiled: Compiled): boolean =>
    archetype.count > 0 && !archetype.resource && hasAll(archetype, compiled.include) && !hasAny(archetype, compiled.not);

const passes = (archetype: Archetype, compiled: Compiled, row: number): boolean => {
    for (const { id, test } of compiled.where) if (!test(cellAt(archetype, id, row))) return false;
    return true;
};

/** Entities with every included component and none of `not`, filtered by `where` and sorted by `order`. */
export const select = (state: State, include: readonly Key[], options: Options = {}): Entity[] => {
    const compiled = compile(state, include, options);
    const order = options.order === undefined ? [] : entriesOf(options.order).map(([key, ascending]) => ({ id: state.ids.get(key) ?? -1, ascending: ascending !== false }));
    const selected: Entity[] = [];
    const keys: unknown[][] = [];
    for (const archetype of state.archetypes) {
        if (!matches(archetype, compiled)) continue;
        const { entities } = archetype;
        for (let row = 0; row < archetype.count; row++) {
            if (compiled.where.length > 0 && !passes(archetype, compiled, row)) continue;
            selected.push(entities[row]);
            if (order.length > 0) keys.push(order.map(({ id }) => cellAt(archetype, id, row)));
        }
    }
    if (order.length === 0) return selected;
    const positions = selected.map((_, i) => i);
    positions.sort((a, b) => {
        for (let i = 0; i < order.length; i++) {
            const result = compare(keys[a][i], keys[b][i]);
            if (result !== 0) return order[i].ascending ? result : -result;
        }
        return 0;
    });
    return positions.map(position => selected[position]);
};

/** The number of entities `select` would return, without building them. */
export const count = (state: State, include: readonly Key[], options: Options = {}): number => {
    const compiled = compile(state, include, options);
    let total = 0;
    for (const archetype of state.archetypes) {
        if (!matches(archetype, compiled)) continue;
        if (compiled.where.length === 0) {
            total += archetype.count;
            continue;
        }
        for (let row = 0; row < archetype.count; row++) if (passes(archetype, compiled, row)) total++;
    }
    return total;
};

/** One component of a live entity, or `undefined` if it's dead or lacks it. */
export const readComponent = (state: State, entity: Entity, key: Key): unknown => {
    const index = locate(state.entities, entity);
    if (index < 0) return undefined;
    const id = state.ids.get(key);
    const storage = id === undefined ? undefined : state.archetypes[state.entities.archetype[index]].storageById[id];
    return storage === undefined ? undefined : readCell(storage, state.entities.row[index]);
};

/** The listed components of a live entity, or `null` if it's dead or lacks any. */
export const readEntity = (state: State, entity: Entity, components: readonly Key[]): object | null => {
    const index = locate(state.entities, entity);
    if (index < 0) return null;
    const archetype = state.archetypes[state.entities.archetype[index]];
    const row = state.entities.row[index];
    const values: { [key: Key]: unknown } = {};
    for (const key of components) {
        const id = state.ids.get(key);
        const storage = id === undefined ? undefined : archetype.storageById[id];
        if (storage === undefined) return null;
        values[key] = readCell(storage, row);
    }
    return values;
};
