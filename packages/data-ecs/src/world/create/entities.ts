import type { Entity } from '../../entity/entity.js';
import { allocateArray, growArray } from './arrays.js';
import type { Memory } from './memory.js';

/** An entity is `index + generation * 2^32`, so a stale reference to a reused index is detected. */
const generationScale = 0x100000000;
/** Generations wrap at 2^21 so entities stay safe integers. */
const generationMask = 0x1FFFFF;

export const indexOf = (entity: Entity): number => entity >>> 0;
export const generationOf = (entity: Entity): number => Math.floor(entity / generationScale);

/**
 * Where each entity index lives. `archetype` is -1 for an index that isn't alive.
 * Spawning reserves through a cursor: first indexes freed before the last sync point, then new indexes past `length`.
 */
export type Entities = {
    archetype: Int32Array;
    row: Uint32Array;
    generation: Uint32Array;
    length: number;
    readonly free: number[];
    /** Free indexes taken by reservations since the last sync point, from the end of `free`. */
    reused: number;
    /** New indexes reserved since the last sync point, starting at `length`. */
    created: number;
    /** Indexes freed during the current sync point, reusable after it. */
    readonly released: number[];
};

const initialCapacity = 64;

export const createEntities = (memory: Memory): Entities => ({
    archetype: allocateArray(memory, Int32Array, initialCapacity),
    row: allocateArray(memory, Uint32Array, initialCapacity),
    generation: allocateArray(memory, Uint32Array, initialCapacity),
    length: 0,
    free: [],
    reused: 0,
    created: 0,
    released: [],
});

export const reserve = (entities: Entities): Entity => {
    if (entities.reused < entities.free.length) {
        const index = entities.free[entities.free.length - 1 - entities.reused++];
        return index + entities.generation[index] * generationScale;
    }
    return entities.length + entities.created++;
};

/** The index of a live entity, or -1. */
export const locate = (entities: Entities, entity: Entity): number => {
    const index = indexOf(entity);
    return index < entities.length && entities.archetype[index] >= 0 && entities.generation[index] === generationOf(entity) ? index : -1;
};

/** At the start of a sync point: makes reserved indexes addressable, not yet alive. */
export const materialize = (memory: Memory, entities: Entities): void => {
    entities.free.length -= entities.reused;
    entities.reused = 0;
    const length = entities.length + entities.created;
    if (length > entities.archetype.length) {
        let capacity = entities.archetype.length;
        while (capacity < length) capacity *= 2;
        entities.archetype = growArray(memory, entities.archetype, Int32Array, capacity, entities.length);
        entities.row = growArray(memory, entities.row, Uint32Array, capacity, entities.length);
        entities.generation = growArray(memory, entities.generation, Uint32Array, capacity, entities.length);
    }
    entities.archetype.fill(-1, entities.length, length);
    entities.generation.fill(0, entities.length, length);
    entities.length = length;
    entities.created = 0;
};

/** Kills an index; it becomes reusable after the current sync point. */
export const release = (entities: Entities, index: number): void => {
    entities.archetype[index] = -1;
    entities.generation[index] = (entities.generation[index] + 1) & generationMask;
    entities.released.push(index);
};

/** At the end of a sync point. */
export const recycle = (entities: Entities): void => {
    for (const index of entities.released) entities.free.push(index);
    entities.released.length = 0;
};
