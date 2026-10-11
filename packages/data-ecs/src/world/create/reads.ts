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

/** A plain value is equality; an object of only comparison operators is a comparison. */
export const satisfies = (value: unknown, condition: unknown): boolean => {
    if (typeof condition !== "object" || condition === null || Array.isArray(condition)) return equals(value, condition);
    const entries = Object.entries(condition);
    if (entries.length === 0 || !entries.every(([operator]) => operators.has(operator))) return equals(value, condition);
    return entries.every(([operator, operand]) => {
        switch (operator) {
            case "==": return equals(value, operand);
            case "!=": return !equals(value, operand);
            case "<": return compare(value, operand) < 0;
            case ">": return compare(value, operand) > 0;
            case "<=": return compare(value, operand) <= 0;
            default: return compare(value, operand) >= 0;
        }
    });
};

const has = (state: State, archetype: Archetype, key: Key): boolean => {
    const id = state.ids.get(key);
    return id !== undefined && archetype.storageOf.has(id);
};

const valueAt = (state: State, archetype: Archetype, row: number, key: Key): unknown => {
    const id = state.ids.get(key);
    const storage = id === undefined ? undefined : archetype.storageOf.get(id);
    return storage === undefined ? undefined : readCell(storage, row);
};

type Options = { readonly not?: readonly Key[]; readonly where?: object; readonly order?: object };

const matches = (state: State, archetype: Archetype, include: readonly Key[], options: Options): boolean =>
    archetype.count > 0 && !archetype.resource && include.every(key => has(state, archetype, key)) && !(options.not ?? []).some(key => has(state, archetype, key));

/** Entities with every included component and none of `not`, filtered by `where` and sorted by `order`. */
export const select = (state: State, include: readonly Key[], options: Options = {}): Entity[] => {
    const where = options.where === undefined ? [] : entriesOf(options.where);
    const order = options.order === undefined ? [] : entriesOf(options.order);
    const selected: { readonly entity: Entity; readonly keys: readonly unknown[] }[] = [];
    for (const archetype of state.archetypes) {
        if (!matches(state, archetype, include, options)) continue;
        for (let row = 0; row < archetype.count; row++) {
            if (!where.every(([key, condition]) => satisfies(valueAt(state, archetype, row, key), condition))) continue;
            selected.push({ entity: archetype.entities[row], keys: order.map(([key]) => valueAt(state, archetype, row, key)) });
        }
    }
    if (order.length > 0) {
        selected.sort((a, b) => {
            for (let i = 0; i < order.length; i++) {
                const result = compare(a.keys[i], b.keys[i]);
                if (result !== 0) return order[i][1] === false ? -result : result;
            }
            return 0;
        });
    }
    return selected.map(({ entity }) => entity);
};

/** The number of entities `select` would return. */
export const count = (state: State, include: readonly Key[], options: Options = {}): number => {
    if (options.where !== undefined) return select(state, include, { not: options.not, where: options.where }).length;
    let total = 0;
    for (const archetype of state.archetypes) if (matches(state, archetype, include, options)) total += archetype.count;
    return total;
};

/** The listed components of a live entity, or `null` if it's dead or lacks any. */
export const readEntity = (state: State, entity: Entity, components: readonly Key[]): object | null => {
    const index = locate(state.entities, entity);
    if (index < 0) return null;
    const archetype = state.archetypes[state.entities.archetype[index]];
    const row = state.entities.row[index];
    const values: { [key: Key]: unknown } = {};
    for (const key of components) {
        if (!has(state, archetype, key)) return null;
        values[key] = valueAt(state, archetype, row, key);
    }
    return values;
};
