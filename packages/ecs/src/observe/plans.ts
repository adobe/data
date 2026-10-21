import type { Component, Entity } from '../index.js';
import { compare, compareNumbers } from './compare.js';

// What a query's rows are gathered into, row by row, from a scan or an index's list: a count; every entity, put in
// entity order once gathered; or by `order`, a bounded heap of the first `offset + limit`, or every row, sorted once
// gathered. Ties under `order` go in entity order. Scratch is typed and reused, so gathering allocates only to grow.

/** A row's values by component, as systems' rows and index lookups' rows give them. */
export type Values = { readonly [K in Component.Key]?: unknown };

/** One term of an `order`: its component and direction. */
export type Term = { readonly key: Component.Key; readonly ascending: boolean };

export type Page = { readonly offset: number; readonly limit: number };

/** Gathers rows, then writes the result, entities into `out` from 0, returning how many, or for a count, the count. */
export type Gather = {
    readonly start: () => void;
    readonly add: (entity: number, values: Values) => void;
    readonly finish: (out: Entity[]) => number;
    /** How many entities `finish` would write now, so a result can be made at its length. */
    readonly size: () => number;
};

/** An entity a world gave out, held as a number in typed scratch. */
// The world's entities are numbers, which scratch arrays hold as they were given.
export const asEntity = (value: number): Entity => value as Entity;

/** An entity's index: its low 32 bits, which order live entities, as an index without a key keeps them. */
export const indexOf = (entity: number): number => entity >>> 0;

export const createCount = (): Gather => {
    let count = 0;
    return {
        start: () => { count = 0; },
        add: () => { count++; },
        finish: () => count,
        size: () => count,
    };
};

/** By entity index, the entity there while sorting, else 0: shared, and cleared after each use. */
let bucket = new Float64Array(0);

/** Writes `count` entities of `from` into `out` in entity order. */
const toEntityOrder = (from: Float64Array, count: number, largest: number, out: Entity[]): void => {
    if (bucket.length <= largest) bucket = new Float64Array(Math.max(largest + 1, 2 * bucket.length));
    for (let i = 0; i < count; i++) bucket[indexOf(from[i])] = from[i];
    if (count * 16 >= largest) {
        let n = 0;
        for (let index = 0; index <= largest && n < count; index++) {
            const entity = bucket[index];
            if (entity === 0) continue;
            bucket[index] = 0;
            out[n++] = asEntity(entity);
        }
        return;
    }
    const indexes = new Uint32Array(count);
    for (let i = 0; i < count; i++) indexes[i] = indexOf(from[i]);
    indexes.sort();
    for (let i = 0; i < count; i++) {
        out[i] = asEntity(bucket[indexes[i]]);
        bucket[indexes[i]] = 0;
    }
};

/**
 * A new array of `count` entities of `from` in entity order: as they are when `ordered`, else sorted, `largest` the
 * largest index among them.
 */
export const inEntityOrder = (from: Float64Array, count: number, largest: number, ordered: boolean): Entity[] => {
    const out = new Array<Entity>(count);
    if (ordered) for (let i = 0; i < count; i++) out[i] = asEntity(from[i]);
    else toEntityOrder(from, count, largest, out);
    return out;
};

/** Every entity, in entity order once gathered. */
export const createAll = (): Gather => {
    let entities = new Float64Array(64);
    let count = 0;
    let largest = 0;
    let ordered = true;
    return {
        start: () => {
            count = 0;
            largest = 0;
            ordered = true;
        },
        add: entity => {
            if (count === entities.length) {
                const grown = new Float64Array(2 * entities.length);
                grown.set(entities);
                entities = grown;
            }
            const index = indexOf(entity);
            if (index < largest) ordered = false;
            else largest = index;
            entities[count++] = entity;
        },
        finish: out => {
            if (ordered) {
                for (let i = 0; i < count; i++) out[i] = asEntity(entities[i]);
                return count;
            }
            toEntityOrder(entities, count, largest, out);
            return count;
        },
        size: () => count,
    };
};

/**
 * Rows held by slot: each one's entity, and per term its value, a number in `numbers` where `isNumber` says so, so
 * numeric keys aren't boxed.
 */
type Slots = {
    entities: Float64Array;
    numbers: Float64Array[];
    isNumber: Uint8Array[];
    values: unknown[][];
};

const createSlots = (terms: number, length: number): Slots => ({
    entities: new Float64Array(length),
    numbers: Array.from({ length: terms }, () => new Float64Array(length)),
    isNumber: Array.from({ length: terms }, () => new Uint8Array(length)),
    values: Array.from({ length: terms }, () => new Array<unknown>(length)),
});

const growSlots = (slots: Slots, length: number): void => {
    const entities = new Float64Array(length);
    entities.set(slots.entities);
    slots.entities = entities;
    for (let t = 0; t < slots.numbers.length; t++) {
        const numbers = new Float64Array(length);
        numbers.set(slots.numbers[t]);
        slots.numbers[t] = numbers;
        const isNumber = new Uint8Array(length);
        isNumber.set(slots.isNumber[t]);
        slots.isNumber[t] = isNumber;
        slots.values[t].length = length;
    }
};

const store = (slots: Slots, terms: readonly Term[], at: number, entity: number, values: Values): void => {
    slots.entities[at] = entity;
    for (let t = 0; t < terms.length; t++) {
        const value = values[terms[t].key];
        if (typeof value === "number") {
            slots.numbers[t][at] = value;
            slots.isNumber[t][at] = 1;
            slots.values[t][at] = undefined;
        }
        else {
            slots.isNumber[t][at] = 0;
            slots.values[t][at] = value;
        }
    }
};

const move = (slots: Slots, from: number, to: number): void => {
    slots.entities[to] = slots.entities[from];
    for (let t = 0; t < slots.numbers.length; t++) {
        slots.numbers[t][to] = slots.numbers[t][from];
        slots.isNumber[t][to] = slots.isNumber[t][from];
        slots.values[t][to] = slots.values[t][from];
    }
};

/** Slots `a` and `b` compared in `order`, then by entity index. */
const compareSlots = (slots: Slots, terms: readonly Term[], a: number, b: number): number => {
    for (let t = 0; t < terms.length; t++) {
        const isNumber = slots.isNumber[t];
        const order = isNumber[a] === 1 && isNumber[b] === 1
            ? compareNumbers(slots.numbers[t][a], slots.numbers[t][b])
            : compare(isNumber[a] === 1 ? slots.numbers[t][a] : slots.values[t][a], isNumber[b] === 1 ? slots.numbers[t][b] : slots.values[t][b]);
        if (order !== 0) return terms[t].ascending ? order : -order;
    }
    return indexOf(slots.entities[a]) - indexOf(slots.entities[b]);
};

/**
 * The first `offset + limit` rows by `order`, or by entity index without terms: a heap of them with the last at its
 * root, O(n log(offset + limit)), sorted once gathered. The last two slots hold a candidate and a swap.
 */
export const createHeap = (terms: readonly Term[], page: Page): Gather => {
    const bound = page.offset + page.limit;
    const slots = createSlots(terms.length, Math.min(bound, 62) + 2);
    let size = 0;
    const swap = (a: number, b: number): void => {
        const spare = slots.entities.length - 1;
        move(slots, a, spare);
        move(slots, b, a);
        move(slots, spare, b);
    };
    const siftUp = (from: number): void => {
        let at = from;
        while (at > 0) {
            const parent = (at - 1) >> 1;
            if (compareSlots(slots, terms, parent, at) >= 0) return;
            swap(parent, at);
            at = parent;
        }
    };
    const siftDown = (from: number, count: number): void => {
        let at = from;
        for (;;) {
            const left = 2 * at + 1;
            if (left >= count) return;
            const right = left + 1;
            const later = right < count && compareSlots(slots, terms, left, right) < 0 ? right : left;
            if (compareSlots(slots, terms, at, later) >= 0) return;
            swap(at, later);
            at = later;
        }
    };
    return {
        start: () => { size = 0; },
        add: (entity, values) => {
            if (bound === 0) return;
            if (size < bound) {
                if (size + 2 >= slots.entities.length) growSlots(slots, Math.min(bound, 2 * slots.entities.length) + 2);
                store(slots, terms, size, entity, values);
                siftUp(size++);
                return;
            }
            // Before the last kept, it replaces it.
            const candidate = slots.entities.length - 2;
            store(slots, terms, candidate, entity, values);
            if (compareSlots(slots, terms, candidate, 0) >= 0) return;
            move(slots, candidate, 0);
            siftDown(0, size);
        },
        finish: out => {
            for (let end = size - 1; end > 0; end--) {
                swap(0, end);
                siftDown(0, end);
            }
            let n = 0;
            for (let i = page.offset; i < size; i++) out[n++] = asEntity(slots.entities[i]);
            for (let t = 0; t < terms.length; t++) slots.values[t].fill(undefined);
            return n;
        },
        size: () => Math.max(0, size - page.offset),
    };
};

/** Every row by `order`, sorted once gathered. */
export const createSorted = (terms: readonly Term[]): Gather => {
    const slots = createSlots(terms.length, 64);
    let size = 0;
    let positions = new Int32Array(64);
    const byOrder = (a: number, b: number): number => compareSlots(slots, terms, a, b);
    return {
        start: () => { size = 0; },
        add: (entity, values) => {
            if (size === slots.entities.length) growSlots(slots, 2 * size);
            store(slots, terms, size++, entity, values);
        },
        finish: out => {
            if (positions.length < size) positions = new Int32Array(slots.entities.length);
            for (let i = 0; i < size; i++) positions[i] = i;
            const sorted = positions.subarray(0, size).sort(byOrder);
            for (let i = 0; i < size; i++) out[i] = asEntity(slots.entities[sorted[i]]);
            for (let t = 0; t < terms.length; t++) slots.values[t].fill(undefined, 0, size);
            return size;
        },
        size: () => size,
    };
};
