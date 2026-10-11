import type { Entity } from '../../entity/entity.js';
import { allocateArray, growArray } from './arrays.js';
import type { Memory } from './memory.js';

/** An entity is `index + generation * 2^32`, so a stale reference to a reused index is detected. */
const generationScale = 0x100000000;
/** Generations wrap at 2^21 so entities stay safe integers. */
const generationMask = 0x1FFFFF;

export const indexOf = (entity: Entity): number => entity >>> 0;
export const generationOf = (entity: Entity): number => Math.floor(entity / generationScale);

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

export const createEntities = (memory: Memory): Entities => ({
    cursor: allocateArray(memory, Int32Array, 4).fill(0),
    free: allocateArray(memory, Int32Array, initialCapacity),
    archetype: allocateArray(memory, Int32Array, initialCapacity),
    row: allocateArray(memory, Uint32Array, initialCapacity),
    generation: allocateArray(memory, Uint32Array, initialCapacity),
    length: 0,
    released: [],
});

/** Reserves an entity. Safe to call from any thread between sync points. */
export const reserve = ({ cursor, free, generation }: Reservations): Entity => {
    const position = Atomics.add(cursor, taken, 1);
    const available = cursor[freeCount];
    if (position < available) {
        const index = free[available - 1 - position];
        return index + generation[index] * generationScale;
    }
    return cursor[tableLength] + position - available;
};

/** Whether any entity was reserved since the last sync point. */
export const reserved = (entities: Entities): boolean => Atomics.load(entities.cursor, taken) > 0;

/** The index of a live entity, or -1. */
export const locate = (entities: Pick<Entities, "archetype" | "generation" | "length">, entity: Entity): number => {
    const index = indexOf(entity);
    return index < entities.length && entities.archetype[index] >= 0 && entities.generation[index] === generationOf(entity) ? index : -1;
};

const capacityFor = (current: number, needed: number): number => {
    let capacity = current;
    while (capacity < needed) capacity *= 2;
    return capacity;
};

/** Indexes reserved since the last sync point: the reused ones, and new ones from `firstNew` up to the table's length. */
export type Reserved = { readonly reused: readonly number[]; readonly firstNew: number };

/** At the start of a sync point: makes reserved indexes addressable, not yet alive. */
export const materialize = (memory: Memory, entities: Entities): Reserved => {
    const { cursor } = entities;
    const count = Atomics.exchange(cursor, taken, 0);
    const reusedCount = Math.min(count, cursor[freeCount]);
    const reused = Array.from(entities.free.subarray(cursor[freeCount] - reusedCount, cursor[freeCount]));
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
