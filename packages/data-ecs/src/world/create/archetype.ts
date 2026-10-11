import type { Entity } from '../../entity/entity.js';
import type { Layout, Views } from '../../layout/layout.js';
import { allocateArray, allocateViews, emptyViews, freeViews, growArray } from './arrays.js';
import { chunkShift } from './kernel.js';
import type { Memory } from './memory.js';

/** One component's storage in one archetype. Its views and ticks are replaced when the archetype grows. */
export type Storage = {
    readonly component: number;
    readonly layout: Layout;
    /** Views of the interleaved column, for a linear layout: row `r` is `layout.stride` bytes at `r * stride`. */
    views: Views;
    /** Values, for an object layout. */
    readonly values: unknown[];
    /** Ticks are f64 so they never wrap; u32 ticks with a clamp pass are a phase 2 optimization. */
    added: Float64Array;
    changed: Float64Array;
    /** The newest `added` and `changed` tick in each chunk of `2 ** chunkShift` rows, so change filters skip unchanged chunks. */
    chunkAdded: Float64Array;
    chunkChanged: Float64Array;
};

/** Chunks covering `capacity` rows. */
const chunksFor = (capacity: number): number => Math.max(1, Math.ceil(capacity / 2 ** chunkShift));

/** Stamps a row's `changed` tick and its chunk's. Ticks only increase, so the chunk's is the newest. */
export const stampChanged = (storage: Storage, row: number, tick: number): void => {
    storage.changed[row] = tick;
    storage.chunkChanged[row >> chunkShift] = tick;
};

export const stampAdded = (storage: Storage, row: number, tick: number): void => {
    storage.added[row] = tick;
    storage.chunkAdded[row >> chunkShift] = tick;
};

/** A table of the entities that have exactly `components`. Rows are dense: `0` to `count`. */
export type Archetype = {
    readonly id: number;
    /** Sorted component ids. */
    readonly components: readonly number[];
    readonly storages: readonly Storage[];
    readonly storageOf: ReadonlyMap<number, Storage>;
    /** Storages by component id, for hot paths. */
    readonly storageById: readonly (Storage | undefined)[];
    /** The archetype with one more or one fewer component, cached as edges are first taken. */
    readonly adding: Map<number, Archetype>;
    readonly removing: Map<number, Archetype>;
    /** For a move to another archetype: each component they share, as source and target storages. */
    readonly moves: Map<Archetype, readonly (readonly [Storage, Storage])[]>;
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
    const chunkAdded = allocateArray(memory, Float64Array, chunksFor(capacity)).fill(0);
    return {
        component,
        layout,
        views: layout.kind === "linear" ? allocateViews(memory, capacity * layout.stride) : emptyViews,
        values: [],
        added,
        changed: layout.kind === "constant" ? added : allocateArray(memory, Float64Array, capacity),
        chunkAdded,
        chunkChanged: layout.kind === "constant" ? chunkAdded : allocateArray(memory, Float64Array, chunksFor(capacity)).fill(0),
    };
};

export const createArchetype = (memory: Memory, id: number, components: readonly number[], layouts: readonly Layout[], resource: boolean): Archetype => {
    const storages = components.map(component => createStorage(memory, component, layouts[component], initialCapacity));
    const storageById: (Storage | undefined)[] = [];
    for (const storage of storages) storageById[storage.component] = storage;
    return {
        id,
        components,
        storages,
        storageOf: new Map(storages.map(storage => [storage.component, storage])),
        storageById,
        adding: new Map(),
        removing: new Map(),
        moves: new Map(),
        entities: allocateArray(memory, Float64Array, initialCapacity),
        count: 0,
        capacity: initialCapacity,
        resource,
        version: 0,
    };
};

const growViews = (memory: Memory, storage: Storage, capacity: number, count: number): void => {
    const { layout } = storage;
    if (layout.kind !== "linear") return;
    const grown = allocateViews(memory, capacity * layout.stride);
    grown.u8.set(storage.views.u8.subarray(0, count * layout.stride));
    freeViews(memory, storage.views);
    storage.views = grown;
};

const grow = (memory: Memory, archetype: Archetype): void => {
    const capacity = archetype.capacity * 2;
    const { count } = archetype;
    for (const storage of archetype.storages) {
        growViews(memory, storage, capacity, count);
        const shared = storage.changed === storage.added;
        storage.added = growArray(memory, storage.added, Float64Array, capacity, count);
        storage.changed = shared ? storage.added : growArray(memory, storage.changed, Float64Array, capacity, count);
        const chunks = chunksFor(capacity);
        if (chunks > storage.chunkAdded.length) {
            const used = storage.chunkAdded.length;
            storage.chunkAdded = growArray(memory, storage.chunkAdded, Float64Array, chunks, used).fill(0, used);
            storage.chunkChanged = shared ? storage.chunkAdded : growArray(memory, storage.chunkChanged, Float64Array, chunks, used).fill(0, used);
        }
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

/** Copies one element of `stride` bytes: by 32-bit words when it's a multiple of 4, which every GPU layout is. */
const copyElement = (from: Views, fromRow: number, to: Views, toRow: number, stride: number): void => {
    if ((stride & 3) === 0) {
        const words = stride >> 2;
        const source = fromRow * words;
        const target = toRow * words;
        for (let i = 0; i < words; i++) to.u32[target + i] = from.u32[source + i];
        return;
    }
    const source = fromRow * stride;
    const target = toRow * stride;
    for (let i = 0; i < stride; i++) to.u8[target + i] = from.u8[source + i];
};

/** Copies one component's value and ticks between rows of storages with the same layout. */
export const copyCell = (from: Storage, fromRow: number, to: Storage, toRow: number): void => {
    const { layout } = from;
    if (layout.kind === "linear") copyElement(from.views, fromRow, to.views, toRow, layout.stride);
    else if (layout.kind === "object") to.values[toRow] = from.values[fromRow];
    const added = from.added[fromRow];
    const changed = from.changed[fromRow];
    to.added[toRow] = added;
    to.changed[toRow] = changed;
    // A chunk's tick is the newest of its rows, so a row moving in can raise it.
    const chunk = toRow >> chunkShift;
    if (added > to.chunkAdded[chunk]) to.chunkAdded[chunk] = added;
    if (changed > to.chunkChanged[chunk]) to.chunkChanged[chunk] = changed;
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
