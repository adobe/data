import type { Entity } from '../../interface/entity/entity.js';
import { viewsOf, type Layout, type Views } from '../../interface/registry/layout.js';
import { ensureCapacity, type Archetype, writeF32, writeF32Lanes, writeF64, writeI32, writeOf, writeU32 } from './archetype.js';
import { indexOf } from './entities.js';
import { chunkShift } from './kernel.js';
import { archetypeOf, type State } from './state.js';
import { gainsOf } from './structure.js';
import { writeDefault } from './synchronize.js';

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
    readonly columns: readonly Column[];
    entities: Float64Array;
    count: number;
    capacity: number;
};

/** Writes one value into row `row` of a column, specialized to the column's layout when the spawner is made. */
export type Writer = (row: number, value: unknown) => void;

const initialCapacity = 64;

const columnOf = (state: State, id: number, capacity: number): Column => {
    const layout = state.layouts[id];
    const stride = layout.kind === "linear" ? layout.stride : 0;
    return { id, layout, ...writeOf(layout), stride, views: viewsOf(new ArrayBuffer(capacity * stride), 0, capacity * stride), values: [] };
};

/** The batch of spawns of exactly these components, made on first use. */
export const batchOf = (state: State, ids: readonly number[]): SpawnBatch => {
    const sorted = [...ids].sort((a, b) => a - b);
    const key = sorted.join(",");
    let batch = state.batchByKey.get(key);
    if (batch === undefined) {
        batch = { ids: sorted, columns: sorted.map(id => columnOf(state, id, initialCapacity)), entities: new Float64Array(initialCapacity), count: 0, capacity: initialCapacity };
        state.batchByKey.set(key, batch);
        state.batches.push(batch);
    }
    return batch;
};

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

/**
 * At a sync point, before the plan: copies every batch into its archetype, places its entities, and stamps their
 * ticks with the sync point's tick, as a commanded spawn would be. Returns the entities committed.
 */
/**
 * Copies each batch into its archetype, or into its closure under `close` when rules or `within` apply, writing the
 * defaults of derived components it gains. `born` records the first row each target gains.
 */
export const commitBatches = (state: State, tick: number, born: Map<number, number>, close: ((archetype: Archetype) => Archetype) | null): number => {
    let committed = 0;
    for (const batch of state.batches) {
        const n = batch.count;
        if (n === 0) continue;
        const spawned = archetypeOf(state, batch.ids);
        const target = close === null ? spawned : close(spawned);
        ensureCapacity(state.memory, target, target.count + n);
        const start = target.count;
        if (!born.has(target.id)) born.set(target.id, start);
        if (close !== null) {
            for (const id of gainsOf(state.structure, state.derived, null, target)) {
                const storage = target.storageById[id];
                if (storage !== undefined) for (let row = start; row < start + n; row++) writeDefault(state, storage, row, tick);
            }
        }
        target.entities.set(batch.entities.subarray(0, n), start);
        for (const column of batch.columns) {
            const storage = target.storageById[column.id];
            if (storage === undefined) continue;
            if (column.layout.kind === "linear") storage.views.u8.set(column.views.u8.subarray(0, n * column.stride), start * column.stride);
            else if (column.layout.kind === "object") {
                for (let i = 0; i < n; i++) storage.values[start + i] = column.values[i];
                column.values.fill(undefined, 0, n);
            }
            if (!storage.ticked) continue;
            storage.added.fill(tick, start, start + n);
            if (storage.changed !== storage.added) storage.changed.fill(tick, start, start + n);
            // Ticks only increase, so the newest tick in each chunk the rows reach is this one.
            storage.chunkAdded.fill(tick, start >> chunkShift, ((start + n - 1) >> chunkShift) + 1);
            if (storage.chunkChanged !== storage.chunkAdded) storage.chunkChanged.fill(tick, start >> chunkShift, ((start + n - 1) >> chunkShift) + 1);
        }
        const { entities } = state;
        for (let i = 0; i < n; i++) {
            const index = indexOf(batch.entities[i]);
            entities.archetype[index] = target.id;
            entities.row[index] = start + i;
        }
        target.count += n;
        state.touched?.add(target);
        batch.count = 0;
        committed += n;
    }
    return committed;
};
