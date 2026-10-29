// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from '../../interface/entity/entity.js';
import { viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { writeF32, writeF32Lanes, writeF64, writeI32, writeOf, writeU32, type Archetype } from './archetype.js';
import type { Reservations } from './entities.js';

// Spawn staging that needs no world: batches, their writers and generated spawners, shared by the main thread and workers.

/** One component of a spawn batch: its values in the target storage's layout, so committing is a block copy. */
export type Column = {
    readonly id: number;
    readonly layout: Layout;
    readonly write: number;
    readonly unitStride: number;
    readonly unitOffset: number;
    readonly lanes: number;
    readonly stride: number;
    views: Views;
    readonly values: unknown[];
    /** Where a joined thread fills its objects, so a spawn here gives it only its start or `null`: why another fails. */
    remote: string | null;
};

/**
 * Spawns of one set of components, written as they're issued into private columns and copied into their archetype at
 * the sync point. Nothing touches archetype storage during a run, and spawned values are read once, while fresh.
 */
export type SpawnBatch = {
    /** Sorted component ids. */
    readonly ids: readonly number[];
    /**
     * By component id, the number of each shared component's value its spawns hold, which their archetype holds once:
     * interned again as the batch is revived.
     */
    shared: readonly (number | undefined)[];
    /** The archetype of `ids`, found at the first sync point the batch commits at, and its generation then. */
    archetype: Archetype | null;
    generation: number;
    readonly columns: readonly Column[];
    entities: Float64Array;
    count: number;
    capacity: number;
    /**
     * Set once the batch was let go of with a value it holds (`batches.ts`), its capacity 0, so a spawner still holding
     * it revives it as it next opens a row; null otherwise.
     */
    revive: (() => void) | null;
};

/** Writes one value into row `row` of a column, specialized to the column's layout when the spawner is made. */
export type Writer = (row: number, value: unknown) => void;

/** Spawns of a batch's components with their values by position, each `undefined` its start. */
export type Positional = (...values: unknown[]) => Entity;

const initialCapacity = 64;

/** The shared values of a batch without shared components: none. */
const noShared: readonly (number | undefined)[] = [];

const columnOf = (layout: Layout, id: number, capacity: number): Column => {
    const stride = layout.kind === "linear" ? layout.stride : 0;
    return { id, layout, ...writeOf(layout), stride, views: viewsOf(new ArrayBuffer(capacity * stride), 0, capacity * stride), values: [], remote: null };
};

/** An empty batch of spawns of exactly these components, by their layouts. */
export const createBatch = (layouts: readonly Layout[], ids: readonly number[], shared: readonly (number | undefined)[] = noShared): SpawnBatch => {
    const sorted = [...ids].sort((a, b) => a - b);
    return { ids: sorted, shared, archetype: null, columns: sorted.map(id => columnOf(layouts[id], id, initialCapacity)), entities: new Float64Array(initialCapacity), count: 0, capacity: initialCapacity, revive: null, generation: 0 };
};

/** Grows a batch to hold at least `needed` rows: twice its capacity, or `needed` where that's more. */
const grow = (batch: SpawnBatch, needed = batch.count + 1): void => {
    const { revive } = batch;
    if (revive !== null) {
        batch.revive = null;
        revive();
        if (needed <= batch.capacity) return;
    }
    const capacity = Math.max(batch.capacity * 2, needed);
    for (const column of batch.columns) {
        const views = viewsOf(new ArrayBuffer(capacity * column.stride), 0, capacity * column.stride);
        views.u8.set(column.views.u8.subarray(0, batch.count * column.stride));
        column.views = views;
    }
    const entities = new Float64Array(capacity);
    entities.set(batch.entities.subarray(0, batch.count));
    batch.entities = entities;
    batch.capacity = capacity;
};

/**
 * A column's writer: numbers and f32 tuples straight into its view, the rest through `writeColumn`; `undefined` writes
 * `start`, the component's start.
 */
export const writerOf = (column: Column, start: unknown): Writer => {
    const { unitStride, unitOffset, lanes } = column;
    const general: Writer = column.layout.kind === "object" || column.layout.kind === "string"
        ? (row, value) => {
            if (column.remote !== null && value !== undefined && value !== null && value !== start) throw new Error(column.remote);
            writeColumn(column, row, value === undefined ? start : value);
        }
        : (row, value) => writeColumn(column, row, value === undefined ? start : value);
    switch (column.write) {
        case writeF32: return (row, value) => {
            if (typeof value !== "number") return general(row, value);
            column.views.f32[row * unitStride + unitOffset] = value;
        };
        case writeU32: return (row, value) => {
            if (typeof value !== "number") return general(row, value);
            column.views.u32[row * unitStride + unitOffset] = value;
        };
        case writeF32Lanes: return (row, value) => {
            if (!Array.isArray(value)) return general(row, value);
            const { f32 } = column.views;
            const index = row * unitStride + unitOffset;
            for (let lane = 0; lane < lanes; lane++) f32[index + lane] = Number(value[lane]);
        };
        default: return general;
    }
};

/** Writes one value as the sync point would: numbers and f32 lane tuples straight into the view, the rest through the layout. */
const writeColumn = (column: Column, row: number, value: unknown): void => {
    const { views } = column;
    const index = row * column.unitStride + column.unitOffset;
    switch (column.write) {
        case writeF32: if (typeof value === "number") return void (views.f32[index] = value); break;
        case writeU32: if (typeof value === "number") return void (views.u32[index] = value); break;
        case writeI32: if (typeof value === "number") return void (views.i32[index] = value); break;
        case writeF64: if (typeof value === "number") return void (views.f64[index] = value); break;
        case writeF32Lanes:
            if (Array.isArray(value)) {
                for (let lane = 0; lane < column.lanes; lane++) views.f32[index + lane] = Number(value[lane]);
                return;
            }
    }
    const { layout } = column;
    if (layout.kind === "linear") layout.write(views, row, value);
    // A string is written into its record as the batch commits, on the world's thread.
    else if (layout.kind === "object" || layout.kind === "string") column.values[row] = value;
};

/** The row the batch's next spawn writes, growing it first if it's full. */
export const openRow = (batch: SpawnBatch): number => {
    if (batch.count === batch.capacity) grow(batch);
    return batch.count;
};

/** The first of the `n` rows the batch's next spawns write, growing it first to hold them. */
export const openRows = (batch: SpawnBatch, n: number): number => {
    if (batch.count + n > batch.capacity) grow(batch, batch.count + n);
    return batch.count;
};

/** Claims the open rows for `entities`, once all their values are written. */
export const claimRows = (batch: SpawnBatch, entities: Float64Array): void => {
    batch.entities.set(entities, batch.count);
    batch.count += entities.length;
};

/** Claims the open row for `entity`, once all its values are written. */
export const claim = (batch: SpawnBatch, entity: number): void => {
    batch.entities[batch.count] = entity;
    batch.count++;
};

/** Whether code can be generated here; a content security policy without `'unsafe-eval'` forbids it. */
let generating = true;

/** Statements storing value expression `value` into column `k`: numbers and f32 tuples inline, anything else through its writer. */
const store = (column: Column, k: number, value: string): string => {
    const at = `row * ${column.unitStride} + ${column.unitOffset}`;
    switch (column.write) {
        case writeF32:
        case writeU32:
            return `v = ${value}; if (typeof v === "number") c${k}.views.${column.write === writeF32 ? "f32" : "u32"}[${at}] = v; else w${k}(row, v);`;
        case writeF32Lanes: {
            const lanes = Array.from({ length: column.lanes }, (_, lane) => `f[at + ${lane}] = Number(v[${lane}]);`).join(" ");
            return `v = ${value}; if (Array.isArray(v)) { const f = c${k}.views.f32; const at = ${at}; ${lanes} } else w${k}(row, v);`;
        }
        default:
            return `w${k}(row, ${value});`;
    }
};

/** Statements copying a value encoded once into the column's layout, `e${k}`, into row `row`: by word where it has whole words. */
const copy = (column: Column, k: number): string => (column.stride & 3) === 0
    ? `{ const e = e${k}, d = c${k}.views.u32, at = row * ${column.stride >> 2}; for (let i = 0; i < ${column.stride >> 2}; i++) d[at + i] = e[i]; }`
    : `{ const e = e${k}, d = c${k}.views.u8, at = row * ${column.stride}; for (let i = 0; i < ${column.stride}; i++) d[at + i] = e[i]; }`;

/** A value encoded once in a column's layout, as `generated` copies it into each spawn: words where it has whole words. */
export const encodedIn = (column: Column, value: unknown): Uint32Array | Uint8Array | null => {
    if (column.layout.kind !== "linear") return null;
    const views = viewsOf(new ArrayBuffer(column.stride), 0, column.stride);
    column.layout.write(views, 0, value);
    return (column.stride & 3) === 0 ? views.u32 : views.u8;
};

/** What a spawner's parameter `values = none` takes when its call gives nothing: none of them. */
export const noValues: { readonly [key: symbol]: unknown } = {};

/** Keys a spawner's `values` must not give, each given failing through `refuse`: a spawn's constants. */
export type Guarded = { readonly keys: readonly unknown[]; readonly refuse: (key: unknown) => never };

/**
 * A function generated to spawn into `batch`, taking `parameters`: one straight-line store per column, of the value
 * expression `values[k]` gives, which may name key `k${k}` of `keys`, so each store sees one layout and each read one
 * object shape, or a copy of a value `encoded` once for every spawn, then reserves its entity with `take(entities)`.
 * Only numbers are written into the code: keys, columns, writers and encoded values are its arguments. Null where code
 * can't be generated. With `guarded`, it first refuses each of its keys its parameter `values` gives.
 */
export const generated = <F, E = Reservations>(entities: E, take: (entities: E) => Entity, batch: SpawnBatch, parameters: readonly string[], keys: readonly unknown[], columns: readonly Column[], writers: readonly Writer[], values: (k: number) => string, encoded: readonly (Uint32Array | Uint8Array | null)[] = [], guarded: Guarded | null = null): F | null => {
    if (!generating) return null;
    const guards = guarded === null ? [] : guarded.keys.map((_, g) => `if (values[g${g}] !== undefined) refuse(g${g});`);
    const body = [
        `return (${parameters.join(", ")}) => {`, ...guards, "const row = openRow(batch);", "let v;",
        ...columns.map((column, k) => encoded[k] === null || encoded[k] === undefined ? store(column, k, values(k)) : copy(column, k)),
        "const entity = take(entities);", "claim(batch, entity);", "return entity;", "};",
    ].join("\n");
    try {
        const guardKeys = guarded?.keys ?? [];
        const factory = new Function("batch", "entities", "openRow", "claim", "take", "refuse", "none", ...columns.flatMap((_, k) => [`k${k}`, `c${k}`, `w${k}`, `e${k}`]), ...guardKeys.map((_, g) => `g${g}`), body);
        // The factory returns the function its body above makes.
        const made: F = factory(batch, entities, openRow, claim, take, guarded?.refuse ?? null, noValues, ...columns.flatMap((_, k) => [keys[k], columns[k], writers[k], encoded[k] ?? null]), ...guardKeys);
        return made;
    }
    catch {
        generating = false;
        return null;
    }
};

/**
 * Spawns into `batch` taking one value per component of `order`, a list of the batch's component ids, each
 * `undefined` its `starts` entry at the same position, reserving each entity through `take`: generated, else a loop
 * over the writers. A constant's column holds nothing, so nothing is written for it.
 */
export const positionalSpawner = <E>(entities: E, take: (entities: E) => Entity, batch: SpawnBatch, order: readonly number[], starts: readonly unknown[]): Positional => {
    const columns = batch.columns.filter(column => column.layout.kind !== "constant");
    const at = columns.map(column => order.indexOf(column.id));
    const writers = columns.map((column, k) => writerOf(column, starts[at[k]]));
    const made = generated<Positional, E>(entities, take, batch, order.map((_, k) => `v${k}`), [], columns, writers, k => `v${at[k]}`);
    if (made !== null) return made;
    return (...values) => {
        const row = openRow(batch);
        for (let k = 0; k < writers.length; k++) writers[k](row, values[at[k]]);
        const entity = take(entities);
        claim(batch, entity);
        return entity;
    };
};
