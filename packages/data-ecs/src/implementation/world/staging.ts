import type { Entity } from '../../interface/entity/entity.js';
import { viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { writeF32, writeF32Lanes, writeF64, writeI32, writeOf, writeU32, type Archetype } from './archetype.js';
import type { Reservations } from './entities.js';
import type { PostedSpawns } from './protocol.js';

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
};

/**
 * Spawns of one set of components, written as they're issued into private columns and copied into their archetype at
 * the sync point. Nothing touches archetype storage during a run, and spawned values are read once, while fresh.
 */
export type SpawnBatch = {
    /** Sorted component ids. */
    readonly ids: readonly number[];
    /** The archetype of `ids`, found at the first sync point the batch commits at. */
    archetype: Archetype | null;
    readonly columns: readonly Column[];
    entities: Float64Array;
    count: number;
    capacity: number;
};

/** Writes one value into row `row` of a column, specialized to the column's layout when the spawner is made. */
export type Writer = (row: number, value: unknown) => void;

/** Spawns of a batch's components with their values by position, each `undefined` its start. */
export type Positional = (...values: unknown[]) => Entity;

const initialCapacity = 64;

const columnOf = (layout: Layout, id: number, capacity: number): Column => {
    const stride = layout.kind === "linear" ? layout.stride : 0;
    return { id, layout, ...writeOf(layout), stride, views: viewsOf(new ArrayBuffer(capacity * stride), 0, capacity * stride), values: [] };
};

/** An empty batch of spawns of exactly these components, by their layouts. */
export const createBatch = (layouts: readonly Layout[], ids: readonly number[]): SpawnBatch => {
    const sorted = [...ids].sort((a, b) => a - b);
    return { ids: sorted, archetype: null, columns: sorted.map(id => columnOf(layouts[id], id, initialCapacity)), entities: new Float64Array(initialCapacity), count: 0, capacity: initialCapacity };
};

/** The first `count` rows of a batch as a worker posts them, emptying the batch, with the buffers to transfer. */
export const postBatch = (batch: SpawnBatch, transfer: ArrayBuffer[]): PostedSpawns => {
    const { count } = batch;
    const bytes = batch.columns.map(column => column.views.u8.slice(0, count * column.stride));
    const values = batch.columns.map(column => {
        if (column.layout.kind !== "object") return [];
        const taken = column.values.slice(0, count);
        column.values.fill(undefined, 0, count);
        return taken;
    });
    const entities = batch.entities.slice(0, count);
    for (const column of bytes) transfer.push(column.buffer);
    transfer.push(entities.buffer);
    batch.count = 0;
    return { ids: batch.ids, count, entities, bytes, values };
};

/** A batch over the rows a worker posted, to commit as the main thread's own. */
export const receivedBatch = (layouts: readonly Layout[], posted: PostedSpawns): SpawnBatch => ({
    ids: posted.ids,
    archetype: null,
    columns: posted.ids.map((id, c) => {
        const layout = layouts[id];
        const bytes = posted.bytes[c];
        return { id, layout, ...writeOf(layout), stride: layout.kind === "linear" ? layout.stride : 0, views: viewsOf(bytes.buffer, bytes.byteOffset, bytes.byteLength), values: posted.values[c] };
    }),
    entities: posted.entities,
    count: posted.count,
    capacity: posted.count,
});

const grow = (batch: SpawnBatch): void => {
    const capacity = batch.capacity * 2;
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
    const general: Writer = (row, value) => writeColumn(column, row, value === undefined ? start : value);
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
    else if (layout.kind === "object") column.values[row] = value;
};

/** The row the batch's next spawn writes, growing it first if it's full. */
export const openRow = (batch: SpawnBatch): number => {
    if (batch.count === batch.capacity) grow(batch);
    return batch.count;
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

/**
 * A function generated to spawn into `batch`, taking `parameters`: one straight-line store per column, of the value
 * expression `values[k]` gives, which may name key `k${k}` of `keys`, so each store sees one layout and each read one
 * object shape, then reserves its entity with `take(entities)`. Only numbers are written into the code: keys, columns
 * and writers are its arguments. Null where code can't be generated.
 */
export const generated = <F, E = Reservations>(entities: E, take: (entities: E) => Entity, batch: SpawnBatch, parameters: readonly string[], keys: readonly unknown[], columns: readonly Column[], writers: readonly Writer[], values: (k: number) => string): F | null => {
    if (!generating) return null;
    const body = [
        `return (${parameters.join(", ")}) => {`, "const row = openRow(batch);", "let v;",
        ...columns.map((column, k) => store(column, k, values(k))),
        "const entity = take(entities);", "claim(batch, entity);", "return entity;", "};",
    ].join("\n");
    try {
        const factory = new Function("batch", "entities", "openRow", "claim", "take", ...columns.flatMap((_, k) => [`k${k}`, `c${k}`, `w${k}`]), body);
        // The factory returns the function its body above makes.
        const made: F = factory(batch, entities, openRow, claim, take, ...columns.flatMap((_, k) => [keys[k], columns[k], writers[k]]));
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
