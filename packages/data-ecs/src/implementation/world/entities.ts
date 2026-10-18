import type { Entity } from '../../interface/entity/entity.js';
import { allocateArray, growArray } from './arrays.js';
import type { Memory } from './memory.js';

/** An entity is `index + generation * 2^32`, so a stale reference to a reused index is detected. */
const generationScale = 0x100000000;
/** Generations wrap at 2^21 so entities stay safe integers. */
const generationMask = 0x1FFFFF;

export const indexOf = (entity: number): number => entity >>> 0;
export const generationOf = (entity: number): number => Math.floor(entity / generationScale);

/**
 * The entity an id names. Ids passed here come only from the entity table, entity columns and command buffers,
 * which hold nothing but entities.
 */
export const asEntity = (id: number): Entity => id as Entity;

/** `cursor` slots. */
const taken = 0;
const freeCount = 1;
const tableLength = 2;

/** What spawning needs, on the main thread or a worker. All of it lives in shared memory. */
export type Reservations = {
    /** `[reservations since the last sync point, free count, table length]`. */
    readonly cursor: Int32Array;
    readonly free: Int32Array;
    readonly generation: Uint32Array;
};

/**
 * Where each entity index lives. `archetype` is -1 for an index that isn't alive.
 * Spawning reserves through one atomic cursor: first indexes freed before the last sync point, from the end of `free`,
 * then new indexes past `length`.
 */
export type Entities = Reservations & {
    archetype: Int32Array;
    row: Uint32Array;
    generation: Uint32Array;
    free: Int32Array;
    length: number;
    /** Indexes freed during the current sync point, reusable after it. */
    readonly released: number[];
};

const initialCapacity = 64;

/** Index 0 is never alive and never freed, so `Entity.none` and zeroed entity values name no entity. */
export const createEntities = (memory: Memory): Entities => {
    const cursor = allocateArray(memory, Int32Array, 4).fill(0);
    cursor[tableLength] = 1;
    const archetype = allocateArray(memory, Int32Array, initialCapacity);
    archetype[0] = -1;
    return {
        cursor,
        free: allocateArray(memory, Int32Array, initialCapacity),
        archetype,
        row: allocateArray(memory, Uint32Array, initialCapacity),
        generation: allocateArray(memory, Uint32Array, initialCapacity).fill(0),
        length: 1,
        released: [],
    };
};

/** Reserves an entity. Safe to call from any thread between sync points. */
export const reserve = ({ cursor, free, generation }: Reservations): Entity => entityAt(cursor, free, generation, Atomics.add(cursor, taken, 1));

/**
 * Reservations a thread takes in blocks of positions, so threads spawning together don't contend for the cursor.
 * Positions a block leaves unused are reserved entities that never spawn, which the sync point releases.
 */
export type Block = { readonly table: Reservations; next: number; end: number; size: number };

const firstBlock = 8;
const largestBlock = 4096;

export const createBlock = (table: Reservations): Block => ({ table, next: 0, end: 0, size: firstBlock });

/** Reserves an entity from the block, taking a block twice the last one's size, up to a limit, once it's used up. */
export const reserveFrom = (block: Block): Entity => {
    if (block.next === block.end) {
        block.next = Atomics.add(block.table.cursor, taken, block.size);
        block.end = block.next + block.size;
        block.size = Math.min(block.size * 2, largestBlock);
    }
    const { cursor, free, generation } = block.table;
    return entityAt(cursor, free, generation, block.next++);
};

/**
 * Ends the block once its thread's task is done, appending the positions it left unused to `unused`, as start and end
 * pairs, for the sync point to `unreserve`; the next block starts at the first size.
 */
export const endBlock = (block: Block, unused: number[]): void => {
    if (block.next < block.end) unused.push(block.next, block.end);
    block.next = block.end = 0;
    block.size = firstBlock;
};

/**
 * Returns positions `start` to `end` of the reservations a sync point materialized, which no spawn used, to the free
 * list at its end. Their entities were never handed out, so their generations stay. Returns how many it returned.
 */
export const unreserve = (entities: Entities, { reused, firstNew }: Reserved, start: number, end: number): number => {
    const { length } = reused;
    for (let position = start; position < end; position++) entities.released.push(position < length ? reused[length - 1 - position] : firstNew + position - length);
    return end - start;
};

/** The entity a reservation position names: first indexes freed before the last sync point, then new ones. */
const entityAt = (cursor: Int32Array, free: Int32Array, generation: Uint32Array, position: number): Entity => {
    const available = cursor[freeCount];
    if (position < available) {
        const index = free[available - 1 - position];
        return asEntity(index + generation[index] * generationScale);
    }
    return asEntity(cursor[tableLength] + position - available);
};

/** Whether any entity was reserved since the last sync point. */
export const reserved = (entities: Entities): boolean => Atomics.load(entities.cursor, taken) > 0;

/** The index of a live entity, or -1. */
export const locate = (entities: Pick<Entities, "archetype" | "generation" | "length">, entity: number): number => {
    const index = indexOf(entity);
    return index < entities.length && entities.archetype[index] >= 0 && entities.generation[index] === generationOf(entity) ? index : -1;
};

const capacityFor = (current: number, needed: number): number => {
    let capacity = current;
    while (capacity < needed) capacity *= 2;
    return capacity;
};

/** Indexes reserved since the last sync point: the reused ones, and new ones from `firstNew` up to the table's length. */
export type Reserved = { readonly reused: Int32Array; readonly firstNew: number };

/** At the start of a sync point: makes reserved indexes addressable, not yet alive. */
export const materialize = (memory: Memory, entities: Entities): Reserved => {
    const { cursor } = entities;
    const count = Atomics.exchange(cursor, taken, 0);
    const reusedCount = Math.min(count, cursor[freeCount]);
    // A typed copy, since the sync point recycles freed indexes over these.
    const reused = entities.free.slice(cursor[freeCount] - reusedCount, cursor[freeCount]);
    cursor[freeCount] -= reusedCount;
    const firstNew = entities.length;
    const length = entities.length + count - reusedCount;
    if (length > entities.archetype.length) {
        const capacity = capacityFor(entities.archetype.length, length);
        entities.archetype = growArray(memory, entities.archetype, Int32Array, capacity, entities.length);
        entities.row = growArray(memory, entities.row, Uint32Array, capacity, entities.length);
        entities.generation = growArray(memory, entities.generation, Uint32Array, capacity, entities.length);
    }
    entities.archetype.fill(-1, entities.length, length);
    entities.generation.fill(0, entities.length, length);
    entities.length = length;
    cursor[tableLength] = length;
    return { reused, firstNew };
};

/** Kills an index; it becomes reusable after the current sync point. */
export const release = (entities: Entities, index: number): void => {
    entities.archetype[index] = -1;
    entities.generation[index] = (entities.generation[index] + 1) & generationMask;
    entities.released.push(index);
};

/** At the end of a sync point: freed indexes become reservable. */
export const recycle = (memory: Memory, entities: Entities): void => {
    const { cursor, released } = entities;
    const count = cursor[freeCount] + released.length;
    if (count > entities.free.length) entities.free = growArray(memory, entities.free, Int32Array, capacityFor(entities.free.length, count), cursor[freeCount]);
    entities.free.set(released, cursor[freeCount]);
    cursor[freeCount] = count;
    released.length = 0;
};
