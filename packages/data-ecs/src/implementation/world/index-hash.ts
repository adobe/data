import { allocateArray, freeArray } from './arrays.js';
import type { Memory } from './memory.js';

/** Words an entry takes: its entity index, its archetype's id and its row. */
export const entryWords = 3;

/**
 * A hash index: an open-addressing table of buckets by key, linear probing, at most half full, each bucket a segment of
 * one entries buffer with spare slots, its entries in entity order. Every array is in the arena, so other threads read
 * it where the world's thread wrote it. By entity index, the bucket it's filed in, so its old bucket is found without
 * its old key.
 */
export type HashTable = {
    readonly memory: Memory;
    /** Words of a key. */
    readonly words: number;
    /** By slot: a bucket's id plus one, or 0 for none. */
    slots: Int32Array;
    /** By bucket id: its key's hash and words, its segment, and the tick an entity last entered, left or moved in it. */
    hashes: Uint32Array;
    keys: Uint32Array;
    starts: Int32Array;
    lengths: Int32Array;
    capacities: Int32Array;
    ticks: Float64Array;
    /** Bucket ids in use, the ones freed, and how many are empty but kept for their ticks. */
    count: number;
    readonly freed: number[];
    empty: number;
    /** The newest tick at which a bucket was dropped, which a key no bucket holds counts as changed at. */
    cleared: number;
    /** Entries, `entryWords` each; the words segments use, and those moved segments left behind. */
    entries: Int32Array;
    used: number;
    garbage: number;
    /** By entity index: its bucket, or -1. */
    bucketOf: Int32Array;
    /** Entries held. */
    size: number;
    /** By component a lookup watches: by bucket, the newest tick its value may have changed in a row there. */
    readonly watched: Map<number, Float64Array>;
};

const minimumSlots = 16;

export const createHashTable = (memory: Memory, words: number): HashTable => ({
    memory,
    words,
    slots: allocateArray(memory, Int32Array, minimumSlots).fill(0),
    hashes: allocateArray(memory, Uint32Array, 8),
    keys: allocateArray(memory, Uint32Array, Math.max(1, 8 * words)),
    starts: allocateArray(memory, Int32Array, 8),
    lengths: allocateArray(memory, Int32Array, 8),
    capacities: allocateArray(memory, Int32Array, 8),
    ticks: allocateArray(memory, Float64Array, 8),
    count: 0,
    freed: [],
    empty: 0,
    cleared: 0,
    entries: allocateArray(memory, Int32Array, 64 * entryWords),
    used: 0,
    garbage: 0,
    bucketOf: allocateArray(memory, Int32Array, 64).fill(-1),
    size: 0,
    watched: new Map(),
});

/** Frees every array, once nothing reads the table again. */
export const releaseHashTable = (table: HashTable): void => {
    const { memory } = table;
    for (const array of [table.slots, table.hashes, table.keys, table.starts, table.lengths, table.capacities, table.ticks, table.entries, table.bucketOf, ...table.watched.values()]) freeArray(memory, array);
    table.watched.clear();
};

/** An array of `length` in the arena holding the first `used` elements of `array`, which is freed; the rest filled with `fill`. */
const regrow = <T extends Int32Array | Uint32Array | Float64Array>(memory: Memory, array: T, constructor: { new(buffer: ArrayBufferLike, byteOffset: number, length: number): T; readonly BYTES_PER_ELEMENT: number }, length: number, used: number, fill: number): T => {
    const grown = allocateArray(memory, constructor, length);
    grown.set(array.subarray(0, used));
    grown.fill(fill, used);
    freeArray(memory, array);
    return grown;
};

/** Grows what's by entity index to cover `length` indexes. */
export const coverEntities = (table: HashTable, length: number): void => {
    if (table.bucketOf.length >= length) return;
    table.bucketOf = regrow(table.memory, table.bucketOf, Int32Array, Math.max(length, 2 * table.bucketOf.length), table.bucketOf.length, -1);
};

/** Grows what's by bucket id to hold `count` buckets. */
const coverBuckets = (table: HashTable, count: number): void => {
    const capacity = table.hashes.length;
    if (capacity >= count) return;
    const length = Math.max(count, 2 * capacity);
    const { memory, words } = table;
    table.hashes = regrow(memory, table.hashes, Uint32Array, length, capacity, 0);
    table.keys = regrow(memory, table.keys, Uint32Array, Math.max(1, length * words), capacity * words, 0);
    table.starts = regrow(memory, table.starts, Int32Array, length, capacity, 0);
    table.lengths = regrow(memory, table.lengths, Int32Array, length, capacity, 0);
    table.capacities = regrow(memory, table.capacities, Int32Array, length, capacity, 0);
    table.ticks = regrow(memory, table.ticks, Float64Array, length, capacity, 0);
    for (const [component, ticks] of table.watched) table.watched.set(component, regrow(memory, ticks, Float64Array, length, capacity, 0));
};

/** Whether bucket `bucket`'s key is the `words` of `key` from `at`. */
const sameKey = (table: HashTable, bucket: number, key: Uint32Array, at: number): boolean => {
    const { keys, words } = table;
    const base = bucket * words;
    for (let k = 0; k < words; k++) if (keys[base + k] !== key[at + k]) return false;
    return true;
};

/** The bucket of a key, by its hash, or -1 when none holds it. */
export const findBucket = (table: HashTable, key: Uint32Array, at: number, hash: number): number => {
    const { slots, hashes } = table;
    const mask = slots.length - 1;
    for (let slot = hash & mask; ; slot = (slot + 1) & mask) {
        const found = slots[slot];
        if (found === 0) return -1;
        const bucket = found - 1;
        if (hashes[bucket] === hash && sameKey(table, bucket, key, at)) return bucket;
    }
};

/** Places a bucket in the table by its hash; the table has a free slot. */
const place = (slots: Int32Array, bucket: number, hash: number): void => {
    const mask = slots.length - 1;
    let slot = hash & mask;
    while (slots[slot] !== 0) slot = (slot + 1) & mask;
    slots[slot] = bucket + 1;
};

/** Rebuilds the table from the buckets that hold entries or are kept, at a capacity at most half full. */
const rehash = (table: HashTable, buckets: number): void => {
    let capacity = minimumSlots;
    while (capacity < 2 * buckets + 2) capacity *= 2;
    if (capacity !== table.slots.length) {
        freeArray(table.memory, table.slots);
        table.slots = allocateArray(table.memory, Int32Array, capacity);
    }
    table.slots.fill(0);
};

/** The bucket of a key, made empty when none holds it, with its tick at `tick`. */
export const bucketFor = (table: HashTable, key: Uint32Array, at: number, hash: number, tick: number): number => {
    const found = findBucket(table, key, at, hash);
    if (found >= 0) return found;
    const live = table.count - table.freed.length;
    if (2 * (live + 1) > table.slots.length) {
        rehash(table, live + 1);
        for (let bucket = 0; bucket < table.count; bucket++) if (table.capacities[bucket] >= 0) place(table.slots, bucket, table.hashes[bucket]);
    }
    const bucket = table.freed.pop() ?? table.count++;
    coverBuckets(table, table.count);
    table.hashes[bucket] = hash;
    const { keys, words } = table;
    for (let k = 0; k < words; k++) keys[bucket * words + k] = key[at + k];
    table.starts[bucket] = 0;
    table.lengths[bucket] = 0;
    table.capacities[bucket] = 0;
    table.ticks[bucket] = tick;
    for (const ticks of table.watched.values()) ticks[bucket] = tick;
    table.empty++;
    place(table.slots, bucket, hash);
    return bucket;
};

/** Spare slots a segment of `length` entries gets: an eighth, at least 4. */
const capacityFor = (length: number): number => length + Math.max(4, length >> 3);

/** A segment of `capacity` entries at the end of the buffer, growing it as needed; returns its first entry. */
const allocateSegment = (table: HashTable, capacity: number): number => {
    const start = table.used;
    const needed = (start + capacity) * entryWords;
    if (needed > table.entries.length) {
        table.entries = regrow(table.memory, table.entries, Int32Array, Math.max(needed, 2 * table.entries.length), table.used * entryWords, 0);
    }
    table.used += capacity;
    return start;
};

/** Gives a bucket room for `length` entries, moving its segment to the end of the buffer when it doesn't fit. */
const reserve = (table: HashTable, bucket: number, length: number): void => {
    if (table.capacities[bucket] >= length) return;
    const capacity = capacityFor(length);
    const start = allocateSegment(table, capacity);
    const { entries } = table;
    const from = table.starts[bucket] * entryWords;
    entries.copyWithin(start * entryWords, from, from + table.lengths[bucket] * entryWords);
    table.garbage += table.capacities[bucket];
    table.starts[bucket] = start;
    table.capacities[bucket] = capacity;
};

/** Where entity index `index` is in a bucket, or where it would go, by binary search: `~position` when it isn't there. */
export const positionIn = (table: HashTable, bucket: number, index: number): number => {
    const { entries } = table;
    const base = table.starts[bucket];
    let low = 0;
    let high = table.lengths[bucket];
    while (low < high) {
        const middle = (low + high) >>> 1;
        const at = entries[(base + middle) * entryWords];
        if (at < index) low = middle + 1;
        else if (at > index) high = middle;
        else return middle;
    }
    return ~low;
};

/** Updates where entity index `index` is: its archetype and row, in the bucket it's filed in. */
export const relocate = (table: HashTable, bucket: number, index: number, archetype: number, row: number): void => {
    const position = positionIn(table, bucket, index);
    if (position < 0) return;
    const at = (table.starts[bucket] + position) * entryWords;
    table.entries[at + 1] = archetype;
    table.entries[at + 2] = row;
};

/** Notes that a bucket gained or lost its last entry. */
const countEmpty = (table: HashTable, before: number, after: number): void => {
    if (before === 0 && after > 0) table.empty--;
    else if (before > 0 && after === 0) table.empty++;
};

/** Removes entity index `index` from a bucket, stamping it. */
export const removeEntry = (table: HashTable, bucket: number, index: number, tick: number): void => {
    const position = positionIn(table, bucket, index);
    if (position < 0) return;
    const length = table.lengths[bucket];
    const base = table.starts[bucket] * entryWords;
    table.entries.copyWithin(base + position * entryWords, base + (position + 1) * entryWords, base + length * entryWords);
    table.lengths[bucket] = length - 1;
    table.ticks[bucket] = tick;
    table.size--;
    countEmpty(table, length, length - 1);
};

/** Inserts entity index `index` at its archetype and row into a bucket, in entity order, stamping it. */
export const insertEntry = (table: HashTable, bucket: number, index: number, archetype: number, row: number, tick: number): void => {
    const length = table.lengths[bucket];
    reserve(table, bucket, length + 1);
    const found = positionIn(table, bucket, index);
    const position = found < 0 ? ~found : found;
    const base = table.starts[bucket] * entryWords;
    const { entries } = table;
    entries.copyWithin(base + (position + 1) * entryWords, base + position * entryWords, base + length * entryWords);
    const at = base + position * entryWords;
    entries[at] = index;
    entries[at + 1] = archetype;
    entries[at + 2] = row;
    table.lengths[bucket] = length + 1;
    table.ticks[bucket] = tick;
    table.size++;
    countEmpty(table, length, length + 1);
};

/**
 * Applies many removals and insertions to one bucket in one merge: `removed` entity indexes and `added` entries
 * (`entryWords` each), both in entity order. Keeps the bucket's entries in entity order.
 */
export const mergeEntries = (table: HashTable, bucket: number, removed: Int32Array, removedCount: number, added: Int32Array, addedCount: number, scratch: Int32Array, tick: number): void => {
    const length = table.lengths[bucket];
    const result = length - removedCount + addedCount;
    const base = table.starts[bucket] * entryWords;
    const { entries } = table;
    // The bucket's current entries, copied out, merged back with the insertions, skipping the removals.
    scratch.set(entries.subarray(base, base + length * entryWords));
    reserve(table, bucket, result);
    const target = table.entries;
    let to = table.starts[bucket] * entryWords;
    let r = 0;
    let a = 0;
    for (let k = 0; k < length; k++) {
        const index = scratch[k * entryWords];
        while (r < removedCount && removed[r] < index) r++;
        while (a < addedCount && added[a * entryWords] < index) {
            target[to++] = added[a * entryWords];
            target[to++] = added[a * entryWords + 1];
            target[to++] = added[a * entryWords + 2];
            a++;
        }
        if (r < removedCount && removed[r] === index) {
            r++;
            continue;
        }
        target[to++] = index;
        target[to++] = scratch[k * entryWords + 1];
        target[to++] = scratch[k * entryWords + 2];
    }
    for (; a < addedCount; a++) {
        target[to++] = added[a * entryWords];
        target[to++] = added[a * entryWords + 1];
        target[to++] = added[a * entryWords + 2];
    }
    table.lengths[bucket] = result;
    table.ticks[bucket] = tick;
    table.size += result - length;
    countEmpty(table, length, result);
};

/**
 * Drops the empty buckets once they outnumber those holding entries, compacting the segments when moves left more
 * garbage than live entries. A key whose bucket was dropped counts as changed at `tick`.
 */
export const tidyHashTable = (table: HashTable, tick: number): void => {
    const live = table.count - table.freed.length - table.empty;
    if (table.empty > Math.max(64, live)) {
        for (let bucket = 0; bucket < table.count; bucket++) {
            if (table.capacities[bucket] < 0 || table.lengths[bucket] > 0) continue;
            table.garbage += table.capacities[bucket];
            table.capacities[bucket] = -1;
            table.freed.push(bucket);
        }
        table.empty = 0;
        table.cleared = tick;
        rehash(table, live);
        for (let bucket = 0; bucket < table.count; bucket++) if (table.capacities[bucket] >= 0) place(table.slots, bucket, table.hashes[bucket]);
    }
    if (table.garbage > Math.max(1024, table.used - table.garbage)) compact(table);
};

/** Lays every bucket's segment out again, one after another, with their spare slots. */
const compact = (table: HashTable): void => {
    let total = 0;
    for (let bucket = 0; bucket < table.count; bucket++) if (table.capacities[bucket] >= 0) total += capacityFor(table.lengths[bucket]);
    const old = table.entries;
    const entries = allocateArray(table.memory, Int32Array, Math.max(64, total) * entryWords);
    let used = 0;
    for (let bucket = 0; bucket < table.count; bucket++) {
        if (table.capacities[bucket] < 0) continue;
        const length = table.lengths[bucket];
        const from = table.starts[bucket] * entryWords;
        entries.set(old.subarray(from, from + length * entryWords), used * entryWords);
        table.starts[bucket] = used;
        table.capacities[bucket] = capacityFor(length);
        used += table.capacities[bucket];
    }
    freeArray(table.memory, old);
    table.entries = entries;
    table.used = used;
    table.garbage = 0;
};

/**
 * Builds the table again from `count` entries in entity order: entity indexes, archetypes and rows (`entryWords` each
 * in `entries`), and their keys' words and hashes. Every bucket's tick, and every watched tick, is `tick`.
 */
export const loadHashTable = (table: HashTable, count: number, entries: Int32Array, keys: Uint32Array, hashes: Uint32Array, tick: number, entityCount: number): void => {
    const { words } = table;
    coverEntities(table, entityCount);
    table.bucketOf.fill(-1);
    table.count = 0;
    table.freed.length = 0;
    table.empty = 0;
    table.cleared = tick;
    table.size = count;
    rehash(table, 1);
    const bucketOfEntry = new Int32Array(count);
    for (let k = 0; k < count; k++) {
        const hash = hashes[k];
        let bucket = findBucket(table, keys, k * words, hash);
        if (bucket < 0) {
            if (2 * (table.count + 1) > table.slots.length) {
                rehash(table, 2 * (table.count + 1));
                for (let other = 0; other < table.count; other++) place(table.slots, other, table.hashes[other]);
            }
            bucket = table.count++;
            coverBuckets(table, table.count);
            table.hashes[bucket] = hash;
            for (let w = 0; w < words; w++) table.keys[bucket * words + w] = keys[k * words + w];
            table.lengths[bucket] = 0;
            place(table.slots, bucket, hash);
        }
        table.lengths[bucket]++;
        bucketOfEntry[k] = bucket;
    }
    let used = 0;
    for (let bucket = 0; bucket < table.count; bucket++) {
        table.starts[bucket] = used;
        table.capacities[bucket] = capacityFor(table.lengths[bucket]);
        used += table.capacities[bucket];
        table.lengths[bucket] = 0;
        table.ticks[bucket] = tick;
        for (const ticks of table.watched.values()) ticks[bucket] = tick;
    }
    if (used * entryWords > table.entries.length) {
        freeArray(table.memory, table.entries);
        table.entries = allocateArray(table.memory, Int32Array, Math.max(64, used) * entryWords);
    }
    table.used = used;
    table.garbage = 0;
    const target = table.entries;
    for (let k = 0; k < count; k++) {
        const bucket = bucketOfEntry[k];
        const at = (table.starts[bucket] + table.lengths[bucket]++) * entryWords;
        target[at] = entries[k * entryWords];
        target[at + 1] = entries[k * entryWords + 1];
        target[at + 2] = entries[k * entryWords + 2];
        table.bucketOf[entries[k * entryWords]] = bucket;
    }
};

/** Starts keeping, by bucket, the newest tick a watched component may have changed in a row there, at `tick`. */
export const watchHashComponent = (table: HashTable, component: number, tick: number): void => {
    if (table.watched.has(component)) return;
    table.watched.set(component, allocateArray(table.memory, Float64Array, table.hashes.length).fill(tick));
};

/** Stops keeping a watched component's ticks. */
export const unwatchHashComponent = (table: HashTable, component: number): void => {
    const ticks = table.watched.get(component);
    if (ticks === undefined) return;
    freeArray(table.memory, ticks);
    table.watched.delete(component);
};
