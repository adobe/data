import type { Entity } from '../../types/entity/entity.js';
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
export type QueryOptions = {
    readonly required?: readonly Key[];
    readonly not?: readonly Key[];
    readonly where?: object;
    readonly order?: object;
    readonly page?: Page;
};

/** A slice of a query's result. */
type Page = { readonly offset: number; readonly limit: number };

/** A query with its components resolved to ids and its `where` conditions compiled. */
export type CompiledQuery = {
    readonly required: readonly number[];
    readonly not: readonly number[];
    readonly where: readonly { readonly id: number; readonly test: (value: unknown) => boolean }[];
    readonly order: readonly { readonly id: number; readonly ascending: boolean }[];
    readonly page: Page | null;
};

const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;

/** Compiles a query once. Throws for a component without a registered schema, or a page whose offset or limit isn't a non-negative integer. */
export const compileQuery = (state: State, query: QueryOptions): CompiledQuery => {
    const { page } = query;
    if (page !== undefined && !(isCount(page.offset) && isCount(page.limit))) {
        throw new Error(`A query's page needs a non-negative integer offset and limit, not ${String(page.offset)} and ${String(page.limit)}.`);
    }
    return {
        required: (query.required ?? []).map(key => idOf(state, key)),
        not: (query.not ?? []).map(key => idOf(state, key)),
        where: query.where === undefined ? [] : entriesOf(query.where).map(([key, condition]) => ({ id: idOf(state, key), test: predicateOf(condition) })),
        order: query.order === undefined ? [] : entriesOf(query.order).map(([key, ascending]) => ({ id: idOf(state, key), ascending: ascending !== false })),
        page: page === undefined ? null : { offset: page.offset, limit: page.limit },
    };
};

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

/** Reused across paged selections with an `order`, so recomputing one allocates nothing per row. */
export type SelectScratch = {
    /** The matching archetypes, by slot. */
    readonly archetypes: Archetype[];
    /** By slot and `order` term, a reader of that term's cells. */
    readonly readers: ((row: number) => unknown)[];
    /** The bounded heap's entries: each one's archetype slot, row, and position in storage order, which breaks ties. */
    slots: Int32Array;
    rows: Int32Array;
    sequences: Int32Array;
};

export const createSelectScratch = (): SelectScratch => ({ archetypes: [], readers: [], slots: new Int32Array(0), rows: new Int32Array(0), sequences: new Int32Array(0) });

const noReader = (): unknown => undefined;

/** Whether one row comes before another in a query's `order`, and in storage order when the keys tie, as a stable sort leaves them. */
const precedes = (scratch: SelectScratch, order: CompiledQuery["order"], slotA: number, rowA: number, sequenceA: number, slotB: number, rowB: number, sequenceB: number): boolean => {
    const { readers } = scratch;
    const terms = order.length;
    for (let i = 0; i < terms; i++) {
        const result = compare(readers[slotA * terms + i](rowA), readers[slotB * terms + i](rowB));
        if (result !== 0) return order[i].ascending ? result < 0 : result > 0;
    }
    return sequenceA < sequenceB;
};

/** Whether heap entry `a` comes before entry `b`. */
const entryPrecedes = (scratch: SelectScratch, order: CompiledQuery["order"], a: number, b: number): boolean =>
    precedes(scratch, order, scratch.slots[a], scratch.rows[a], scratch.sequences[a], scratch.slots[b], scratch.rows[b], scratch.sequences[b]);

const swapEntries = (scratch: SelectScratch, a: number, b: number): void => {
    const { slots, rows, sequences } = scratch;
    const slot = slots[a], row = rows[a], sequence = sequences[a];
    slots[a] = slots[b]; rows[a] = rows[b]; sequences[a] = sequences[b];
    slots[b] = slot; rows[b] = row; sequences[b] = sequence;
};

/** Restores the heap below `at`, among the first `size` entries; the last in order is at the root. */
const siftDown = (scratch: SelectScratch, order: CompiledQuery["order"], at: number, size: number): void => {
    for (;;) {
        const left = 2 * at + 1;
        if (left >= size) return;
        const right = left + 1;
        const later = right < size && entryPrecedes(scratch, order, left, right) ? right : left;
        if (!entryPrecedes(scratch, order, at, later)) return;
        swapEntries(scratch, at, later);
        at = later;
    }
};

const siftUp = (scratch: SelectScratch, order: CompiledQuery["order"], at: number): void => {
    while (at > 0) {
        const parent = (at - 1) >> 1;
        if (!entryPrecedes(scratch, order, parent, at)) return;
        swapEntries(scratch, parent, at);
        at = parent;
    }
};

/**
 * A page of a query with an `order`: keeps the first `offset + limit` rows in a bounded heap, O(n log(offset + limit)),
 * then sorts just those.
 */
const selectOrderedPage = (state: State, query: CompiledQuery, page: Page, out: Entity[], scratch: SelectScratch): number => {
    const { order } = query;
    const terms = order.length;
    const { archetypes, readers } = scratch;
    let slotCount = 0;
    let total = 0;
    for (const archetype of state.archetypes) {
        if (archetype.count === 0 || !matchesArchetype(archetype, query)) continue;
        archetypes[slotCount] = archetype;
        for (let i = 0; i < terms; i++) readers[slotCount * terms + i] = readerOf(archetype.storageById[order[i].id]);
        slotCount++;
        total += archetype.count;
    }
    const bound = Math.min(page.offset + page.limit, total);
    let size = 0;
    if (bound > page.offset) {
        if (scratch.slots.length < bound) {
            const length = Math.max(bound, 2 * scratch.slots.length);
            scratch.slots = new Int32Array(length);
            scratch.rows = new Int32Array(length);
            scratch.sequences = new Int32Array(length);
        }
        let sequence = 0;
        for (let slot = 0; slot < slotCount; slot++) {
            const archetype = archetypes[slot];
            const passes = query.where.length === 0 ? null : passerOf(archetype, query);
            for (let row = 0; row < archetype.count; row++) {
                if (passes !== null && !passes(row)) continue;
                const at = sequence++;
                if (size < bound) {
                    scratch.slots[size] = slot;
                    scratch.rows[size] = row;
                    scratch.sequences[size] = at;
                    siftUp(scratch, order, size++);
                }
                else if (precedes(scratch, order, slot, row, at, scratch.slots[0], scratch.rows[0], scratch.sequences[0])) {
                    scratch.slots[0] = slot;
                    scratch.rows[0] = row;
                    scratch.sequences[0] = at;
                    siftDown(scratch, order, 0, size);
                }
            }
        }
        for (let end = size - 1; end > 0; end--) {
            swapEntries(scratch, 0, end);
            siftDown(scratch, order, 0, end);
        }
        for (let i = page.offset; i < size; i++) out[i - page.offset] = asEntity(archetypes[scratch.slots[i]].entities[scratch.rows[i]]);
    }
    // Readers hold storages' views, which growth replaces.
    for (let i = 0; i < slotCount * terms; i++) readers[i] = noReader;
    return Math.max(0, size - page.offset);
};

/** A page of a query without an `order`: the slice of its storage order. */
const selectStoragePage = (state: State, query: CompiledQuery, page: Page, out: Entity[]): number => {
    const { limit } = page;
    let skip = page.offset;
    let selected = 0;
    if (limit === 0) return 0;
    for (const archetype of state.archetypes) {
        if (archetype.count === 0 || !matchesArchetype(archetype, query)) continue;
        if (query.where.length === 0 && skip >= archetype.count) {
            skip -= archetype.count;
            continue;
        }
        const { entities } = archetype;
        const passes = query.where.length === 0 ? null : passerOf(archetype, query);
        for (let row = 0; row < archetype.count; row++) {
            if (passes !== null && !passes(row)) continue;
            if (skip > 0) {
                skip--;
                continue;
            }
            out[selected++] = asEntity(entities[row]);
            if (selected === limit) return selected;
        }
    }
    return selected;
};

/**
 * Writes the entities a query matches into `out` from index 0, filtered by `where`, sorted by `order` and sliced by
 * `page`, and returns how many; `out` keeps any longer tail.
 */
export const selectInto = (state: State, query: CompiledQuery, out: Entity[], scratch: SelectScratch): number => {
    const { order, page } = query;
    if (page !== null) return order.length === 0 ? selectStoragePage(state, query, page, out) : selectOrderedPage(state, query, page, out, scratch);
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
