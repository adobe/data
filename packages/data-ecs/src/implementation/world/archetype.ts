import type { Entity } from '../../interface/entity/entity.js';
import type { Layout, Views } from '../../interface/registry/layout.js';
import { allocateArray, allocateViews, emptyViews, freeArray, freeViews, growArray } from './arrays.js';
import { chunkShift } from './kernel.js';
import type { Memory } from './memory.js';
import { nullTag, startTag, type MoveLog } from './move-log.js';

/** One component's storage in one archetype. Its views and ticks are replaced when the archetype grows. */
export type Storage = {
    readonly component: number;
    readonly layout: Layout;
    /** Views of the interleaved column, for a linear layout: row `r` is `layout.stride` bytes at `r * stride`. */
    views: Views;
    /** Values, for an object layout the world's thread fills. */
    readonly values: unknown[];
    /** For an object layout a joined thread fills, its log, and each row's tag (`move-log.ts`) in place of its value. */
    remote: MoveLog | null;
    tags: Uint32Array;
    /** How the sync point writes a value without a closure call: one of the `write` kinds, with its leaves' placement. */
    readonly write: number;
    readonly unitStride: number;
    readonly unitOffset: number;
    readonly lanes: number;
    /** 32-bit words per element of a linear layout whose stride is a multiple of 4, which every GPU layout is; else 0. */
    readonly words: number;
    /**
     * Whether this component keeps ticks: only once some system filters on its `added` or `changed`, and always for
     * resources. Without them the tick arrays are empty and nothing stamps. Ticks are f64 so they never wrap.
     */
    ticked: boolean;
    added: Float64Array;
    changed: Float64Array;
    /** The newest `added` and `changed` tick in each chunk of `2 ** chunkShift` rows, so change filters skip unchanged chunks. */
    chunkAdded: Float64Array;
    chunkChanged: Float64Array;
    /**
     * The newest tick at which every row may have changed, as a GPU kernel's writes do, so stamping them costs
     * nothing per row: change filters pass the whole column when it's newer than their `lastRun`.
     */
    columnChanged: number;
};

/** Bytes after a column's last row, so a WASM kernel's 16-byte load of a row's leaves never reads past the column. */
export const columnSlack = 16;

/** Write kinds: a scalar of one view, or a tuple of `lanes` consecutive f32s, like a vec3; anything else uses `layout.write`. */
export const writeF32 = 1;
export const writeU32 = 2;
export const writeI32 = 3;
export const writeF64 = 4;
export const writeF32Lanes = 5;
export const writeGeneral = 0;

export const writeOf = (layout: Layout): { readonly write: number; readonly unitStride: number; readonly unitOffset: number; readonly lanes: number } => {
    const general = { write: writeGeneral, unitStride: 0, unitOffset: 0, lanes: 0 };
    if (layout.kind !== "linear") return general;
    const [first] = layout.leaves;
    if (first === undefined || layout.leaves.some(leaf => leaf.scalar === "boolean")) return general;
    if (layout.leaves.length === 1 && first.path.length === 0) {
        const kinds: { readonly [view: string]: number } = { f32: writeF32, u32: writeU32, i32: writeI32, f64: writeF64 };
        return { write: kinds[first.view] ?? writeGeneral, unitStride: first.unitStride, unitOffset: first.unitOffset, lanes: 1 };
    }
    const lanes = layout.leaves.every((leaf, i) => leaf.view === "f32" && leaf.path.length === 1 && leaf.path[0] === i && leaf.unitStride === first.unitStride && leaf.unitOffset === first.unitOffset + i);
    return lanes ? { write: writeF32Lanes, unitStride: first.unitStride, unitOffset: first.unitOffset, lanes: layout.leaves.length } : general;
};

/** Chunks covering `capacity` rows. */
const chunksFor = (capacity: number): number => Math.max(1, Math.ceil(capacity / 2 ** chunkShift));

/** What stamping a row's ticks writes: a storage's, or a joined thread's view of one. */
export type Stamped = Pick<Storage, "ticked" | "added" | "changed" | "chunkAdded" | "chunkChanged">;

/** Stamps a row's `changed` tick and its chunk's. Ticks only increase, so the chunk's is the newest. */
export const stampChanged = (storage: Stamped, row: number, tick: number): void => {
    if (!storage.ticked) return;
    storage.changed[row] = tick;
    storage.chunkChanged[row >> chunkShift] = tick;
};

export const stampAdded = (storage: Stamped, row: number, tick: number): void => {
    if (!storage.ticked) return;
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
    /** The archetype with one more or one fewer component, by component id, cached as edges are first taken. */
    readonly adding: (Archetype | undefined)[];
    readonly removing: (Archetype | undefined)[];
    /** For a move to another archetype: each component they share, as source and target storages. */
    /** By target archetype id: the storages they share, as source and target pairs, flattened. */
    readonly moves: (readonly Storage[] | undefined)[];
    entities: Float64Array;
    count: number;
    capacity: number;
    /** Holds the resource entity, so queries and systems never see it. */
    readonly resource: boolean;
    /** Whether a storage holds values as objects, which a removed row must release. */
    readonly objects: boolean;
    /** The logs of the joined threads whose objects it holds, which its moves are appended to; null for none. */
    logs: MoveLog[] | null;
    /** Whether it's listed for the layout directory's next flush of counts. */
    counted: boolean;
    /** Incremented whenever arrays are replaced, so cached views can be refreshed. */
    version: number;
    /** How many times any of the world's archetypes' arrays were replaced, shared by them all. */
    readonly replaced: { count: number };
    /** The world's archetypes created or bumped since the layout directory's last flush (`layout-directory.ts`). */
    readonly bumped: Archetype[];
    /** Whether this archetype is in `bumped`. */
    listed: boolean;
};

/** Moves the version on once arrays are replaced, and lists the archetype for the layout directory's next flush. */
const bump = (archetype: Archetype): void => {
    archetype.version++;
    archetype.replaced.count++;
    if (archetype.listed) return;
    archetype.listed = true;
    archetype.bumped.push(archetype);
};

const initialCapacity = 16;

/** The tick arrays of a storage without ticks. */
const noTicks = new Float64Array(0);
/** The tags of a storage whose values the world's thread holds. */
const noTags = new Uint32Array(0);

/**
 * Gives a storage tick arrays for `capacity` rows, every tick set to `tick`. A constant's value can't change, so its
 * `changed` ticks are its `added` ticks: tags cost one tick per row.
 */
const allocateTicks = (memory: Memory, storage: Storage, capacity: number, tick: number): void => {
    storage.ticked = true;
    storage.added = allocateArray(memory, Float64Array, capacity).fill(tick);
    storage.changed = storage.layout.kind === "constant" ? storage.added : allocateArray(memory, Float64Array, capacity).fill(tick);
    storage.chunkAdded = allocateArray(memory, Float64Array, chunksFor(capacity)).fill(tick);
    storage.chunkChanged = storage.layout.kind === "constant" ? storage.chunkAdded : allocateArray(memory, Float64Array, chunksFor(capacity)).fill(tick);
};

const createStorage = (memory: Memory, component: number, layout: Layout, capacity: number, ticked: boolean): Storage => {
    const storage: Storage = {
        component,
        layout,
        views: layout.kind === "linear" ? allocateViews(memory, capacity * layout.stride + columnSlack) : emptyViews,
        values: [],
        ...writeOf(layout),
        words: layout.kind === "linear" && (layout.stride & 3) === 0 ? layout.stride >> 2 : 0,
        ticked: false,
        added: noTicks,
        changed: noTicks,
        chunkAdded: noTicks,
        chunkChanged: noTicks,
        columnChanged: 0,
        remote: null,
        tags: noTags,
    };
    if (ticked) allocateTicks(memory, storage, capacity, 0);
    return storage;
};

/**
 * Starts keeping ticks for a storage, as if every row was added and changed at `tick`, so a system registered now sees
 * every row on its first run, as it would had the ticks always been kept.
 */
export const startTicks = (memory: Memory, archetype: Archetype, storage: Storage, tick: number): void => {
    if (storage.ticked) return;
    allocateTicks(memory, storage, archetype.capacity, tick);
    bump(archetype);
};

/**
 * Creates an archetype, listed in `bumped` for the layout directory's next flush; storages of components a joined
 * thread fills, by `remote`, hold their tags.
 */
export const createArchetype = (memory: Memory, id: number, components: readonly number[], layouts: readonly Layout[], resource: boolean, ticked: ReadonlySet<number>, bumped: Archetype[], replaced: { count: number }, remote: readonly (MoveLog | undefined)[]): Archetype => {
    const storages = components.map(component => createStorage(memory, component, layouts[component], initialCapacity, resource || ticked.has(component)));
    const storageById: (Storage | undefined)[] = [];
    for (const storage of storages) storageById[storage.component] = storage;
    const archetype: Archetype = {
        id,
        components,
        storages,
        storageOf: new Map(storages.map(storage => [storage.component, storage])),
        storageById,
        adding: [],
        removing: [],
        moves: [],
        entities: allocateArray(memory, Float64Array, initialCapacity),
        count: 0,
        capacity: initialCapacity,
        resource,
        objects: storages.some(storage => storage.layout.kind === "object"),
        version: 0,
        replaced,
        bumped,
        listed: true,
        logs: null,
        counted: false,
    };
    bumped.push(archetype);
    for (const storage of storages) {
        const log = remote[storage.component];
        if (log !== undefined) makeRemote(memory, archetype, storage, log);
    }
    return archetype;
};

const growViews = (memory: Memory, storage: Storage, capacity: number, count: number): void => {
    const { layout } = storage;
    if (layout.kind !== "linear") return;
    const grown = allocateViews(memory, capacity * layout.stride + columnSlack);
    grown.u8.set(storage.views.u8.subarray(0, count * layout.stride));
    freeViews(memory, storage.views);
    storage.views = grown;
};

const grow = (memory: Memory, archetype: Archetype, capacity = archetype.capacity * 2): void => {
    const { count } = archetype;
    for (const storage of archetype.storages) {
        growViews(memory, storage, capacity, count);
        if (storage.remote !== null) storage.tags = growArray(memory, storage.tags, Uint32Array, capacity, count);
        if (!storage.ticked) continue;
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
    bump(archetype);
};

/** Grows once to fit `needed` rows, so a sync point adding many doesn't double over and over. */
export const ensureCapacity = (memory: Memory, archetype: Archetype, needed: number): void => {
    if (needed <= archetype.capacity) return;
    let capacity = archetype.capacity;
    while (capacity < needed) capacity *= 2;
    grow(memory, archetype, capacity);
};

/** Appends a row for `entity`, growing if full. Component values and ticks are left for the caller to write. */
export const insertRow = (memory: Memory, archetype: Archetype, entity: number): number => {
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

/** Copies one component's value, not its ticks, between rows of storages with the same layout. */
export const copyValue = (from: Storage, fromRow: number, to: Storage, toRow: number): void => {
    const { layout, words } = from;
    if (words > 0) {
        const source = from.views.u32;
        const target = to.views.u32;
        const s = fromRow * words;
        const t = toRow * words;
        for (let i = 0; i < words; i++) target[t + i] = source[s + i];
    }
    else if (layout.kind === "linear") copyElement(from.views, fromRow, to.views, toRow, layout.stride);
    else if (layout.kind === "object") {
        if (to.remote === null) to.values[toRow] = from.values[fromRow];
        else to.tags[toRow] = from.tags[fromRow];
    }
};

/** Copies one component's value and ticks between rows of storages with the same layout. */
export const copyCell = (from: Storage, fromRow: number, to: Storage, toRow: number): void => {
    copyValue(from, fromRow, to, toRow);
    // A component keeps ticks in every archetype or in none.
    if (!to.ticked) return;
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
export const swapRemove = (archetype: Archetype, row: number): number => {
    const last = --archetype.count;
    if (row === last && !archetype.objects) return -1;
    const moved = row === last ? -1 : archetype.entities[last];
    for (const storage of archetype.storages) {
        if (moved !== -1) copyCell(storage, last, storage, row);
        if (storage.layout.kind === "object" && storage.remote === null) storage.values[last] = undefined;
    }
    if (moved !== -1) archetype.entities[row] = moved;
    return moved;
};

/**
 * Gives a storage's objects to the joined thread `log` is for: its values are released, every row starting there at
 * its start, and its tags are kept in their place. Allocates, so it runs only between runs.
 */
export const makeRemote = (memory: Memory, archetype: Archetype, storage: Storage, log: MoveLog): void => {
    storage.remote = log;
    storage.tags = allocateArray(memory, Uint32Array, archetype.capacity).fill(startTag);
    storage.values.length = 0;
    if (archetype.logs === null) archetype.logs = [log];
    else if (!archetype.logs.includes(log)) archetype.logs.push(log);
    if (!log.archetypes.includes(archetype)) log.archetypes.push(archetype);
    bump(archetype);
};

/**
 * Takes a storage's objects back from a joined thread that's gone: each row at the value its tag names, `null` or its
 * start, since a slot's value was the thread's. Allocates, so it runs only between runs.
 */
export const makeLocal = (memory: Memory, archetype: Archetype, storage: Storage, start: unknown): void => {
    const log = storage.remote;
    if (log === null) return;
    for (let row = 0; row < archetype.count; row++) storage.values[row] = storage.tags[row] === nullTag ? null : start;
    freeArray(memory, storage.tags);
    storage.tags = noTags;
    storage.remote = null;
    if (!archetype.storages.some(other => other.remote === log)) {
        const logs = (archetype.logs ?? []).filter(other => other !== log);
        archetype.logs = logs.length === 0 ? null : logs;
        log.archetypes.splice(log.archetypes.indexOf(archetype), 1);
    }
    bump(archetype);
};
