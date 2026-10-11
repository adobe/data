import type { Entity } from '../../entity/entity.js';
import { viewsOf, type Layout, type Views } from '../../layout/layout.js';
import { hasSymbolNames } from '../../registry/create-registry.js';
import { ensureCapacity, writeF32, writeF32Lanes, writeF64, writeI32, writeOf, writeU32 } from './archetype.js';
import { indexOf } from './entities.js';
import { chunkShift } from './kernel.js';
import { archetypeOf, idOf, type State } from './state.js';

/** One component of a spawn batch: its values in the target storage's layout, so committing is a block copy. */
type Column = {
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

/** A spawn's own key order, resolved to its batch's columns; `batch` is null when spawns of these keys use commands. */
type Shape = { readonly keys: readonly string[]; readonly batch: SpawnBatch | null; readonly columns: readonly number[] };

const initialCapacity = 64;

const columnOf = (state: State, id: number, capacity: number): Column => {
    const layout = state.layouts[id];
    const stride = layout.kind === "linear" ? layout.stride : 0;
    return { id, layout, ...writeOf(layout), stride, views: viewsOf(new ArrayBuffer(capacity * stride), 0, capacity * stride), values: [] };
};

const batchOf = (state: State, ids: readonly number[]): SpawnBatch => {
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

/** Resolves a key list to a shape. Throws for an unregistered key, as a command would. */
const shapeOf = (state: State, keys: readonly string[]): Shape => {
    const ids = keys.map(key => idOf(state, key));
    // The resource entity's components never take part in spawns.
    if (ids.some(id => state.resources.has(id))) return { keys, batch: null, columns: [] };
    const batch = batchOf(state, ids);
    return { keys, batch, columns: ids.map(id => batch.ids.indexOf(id)) };
};

/** The last eight key lists spawned, replaced round-robin: spawn sites name the same keys in the same order. */
const shapeFor = (state: State, keys: readonly string[]): Shape => {
    const { spawnShapes } = state;
    for (let s = 0; s < spawnShapes.length; s++) {
        const cached = spawnShapes[s].keys;
        if (cached.length !== keys.length) continue;
        let same = true;
        for (let k = 0; k < keys.length && same; k++) same = cached[k] === keys[k];
        if (same) return spawnShapes[s];
    }
    const shape = shapeOf(state, keys);
    if (spawnShapes.length < 8) spawnShapes.push(shape);
    else spawnShapes[state.nextShape = (state.nextShape + 1) % 8] = shape;
    return shape;
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

/**
 * Adds a spawn to its batch. Returns false, having claimed nothing, when it must go through commands instead: a
 * symbol key, a resource component, or an `undefined` value, which leaves the component out. A row is claimed only
 * once every value is written, so a value that throws leaves nothing behind.
 */
export const stageSpawn = (state: State, entity: Entity, values: object): boolean => {
    if (hasSymbolNames()) return false;
    const keys = Object.keys(values);
    const { batch, columns } = shapeFor(state, keys);
    if (batch === null) return false;
    if (batch.count === batch.capacity) grow(batch);
    const row = batch.count;
    for (let k = 0; k < keys.length; k++) {
        const value: unknown = Reflect.get(values, keys[k]);
        if (value === undefined) return false;
        writeColumn(batch.columns[columns[k]], row, value);
    }
    batch.entities[row] = entity;
    batch.count++;
    return true;
};

/**
 * At a sync point, before the plan: copies every batch into its archetype, places its entities, and stamps their
 * ticks with the sync point's tick, as a commanded spawn would be. Returns the entities committed.
 */
export const commitBatches = (state: State, tick: number): number => {
    let committed = 0;
    for (const batch of state.batches) {
        const n = batch.count;
        if (n === 0) continue;
        const target = archetypeOf(state, batch.ids);
        ensureCapacity(state.memory, target, target.count + n);
        const start = target.count;
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
        batch.count = 0;
        committed += n;
    }
    return committed;
};
