import type { Entity } from '../../entity/entity.js';
import { allocateArray, freeArray, growArray } from './arrays.js';
import { allocateLeaf, type Layout, type TypedArray } from './layout.js';
import type { Memory } from './memory.js';

/** One component's columns in one archetype. Arrays are replaced when the archetype grows. */
export type Storage = {
    readonly component: number;
    readonly layout: Layout;
    /** One typed array per scalar leaf, for a linear layout. */
    fields: TypedArray[];
    /** Values, for an object layout. */
    readonly values: unknown[];
    /** Ticks are f64 so they never wrap; u32 ticks with a clamp pass are a phase 2 optimization. */
    added: Float64Array;
    changed: Float64Array;
};

/** A table of the entities that have exactly `components`. Rows are dense: `0` to `count`. */
export type Archetype = {
    readonly id: number;
    /** Sorted component ids. */
    readonly components: readonly number[];
    readonly storages: readonly Storage[];
    readonly storageOf: ReadonlyMap<number, Storage>;
    entities: Float64Array;
    count: number;
    capacity: number;
    /** Holds the resource entity, so queries and systems never see it. */
    readonly resource: boolean;
    /** Incremented whenever arrays are replaced, so cached views can be refreshed. */
    version: number;
};

const initialCapacity = 16;

/** A constant's value can't change, so its `changed` ticks are its `added` ticks: tags cost one tick per row. */
const createStorage = (memory: Memory, component: number, layout: Layout, capacity: number): Storage => {
    const added = allocateArray(memory, Float64Array, capacity);
    return {
        component,
        layout,
        fields: layout.kind === "linear" ? layout.leaves.map(leaf => allocateLeaf(memory, leaf.scalar, capacity)) : [],
        values: [],
        added,
        changed: layout.kind === "constant" ? added : allocateArray(memory, Float64Array, capacity),
    };
};

export const createArchetype = (memory: Memory, id: number, components: readonly number[], layouts: readonly Layout[], resource: boolean): Archetype => {
    const storages = components.map(component => createStorage(memory, component, layouts[component], initialCapacity));
    return {
        id,
        components,
        storages,
        storageOf: new Map(storages.map(storage => [storage.component, storage])),
        entities: allocateArray(memory, Float64Array, initialCapacity),
        count: 0,
        capacity: initialCapacity,
        resource,
        version: 0,
    };
};

const growFields = (memory: Memory, storage: Storage, capacity: number, count: number): void => {
    const { layout } = storage;
    if (layout.kind !== "linear") return;
    storage.fields = storage.fields.map((field, i) => {
        const grown = allocateLeaf(memory, layout.leaves[i].scalar, capacity);
        grown.set(field.subarray(0, count));
        freeArray(memory, field);
        return grown;
    });
};

const grow = (memory: Memory, archetype: Archetype): void => {
    const capacity = archetype.capacity * 2;
    const { count } = archetype;
    for (const storage of archetype.storages) {
        growFields(memory, storage, capacity, count);
        const shared = storage.changed === storage.added;
        storage.added = growArray(memory, storage.added, Float64Array, capacity, count);
        storage.changed = shared ? storage.added : growArray(memory, storage.changed, Float64Array, capacity, count);
    }
    archetype.entities = growArray(memory, archetype.entities, Float64Array, capacity, count);
    archetype.capacity = capacity;
    archetype.version++;
};

/** Appends a row for `entity`, growing if full. Component values and ticks are left for the caller to write. */
export const insertRow = (memory: Memory, archetype: Archetype, entity: Entity): number => {
    if (archetype.count === archetype.capacity) grow(memory, archetype);
    const row = archetype.count++;
    archetype.entities[row] = entity;
    return row;
};

/** Copies one component's value and ticks between rows of storages with the same layout. */
export const copyCell = (from: Storage, fromRow: number, to: Storage, toRow: number): void => {
    for (let i = 0; i < from.fields.length; i++) to.fields[i][toRow] = from.fields[i][fromRow];
    if (from.layout.kind === "object") to.values[toRow] = from.values[fromRow];
    to.added[toRow] = from.added[fromRow];
    to.changed[toRow] = from.changed[fromRow];
};

/** Removes a row by moving the last row into it. Returns the moved entity, or -1 if the removed row was last. */
export const swapRemove = (archetype: Archetype, row: number): Entity => {
    const last = --archetype.count;
    const moved = row === last ? -1 : archetype.entities[last];
    for (const storage of archetype.storages) {
        if (moved !== -1) copyCell(storage, last, storage, row);
        if (storage.layout.kind === "object") storage.values[last] = undefined;
    }
    if (moved !== -1) archetype.entities[row] = moved;
    return moved;
};
