import { allocateArray, freeArray } from './arrays.js';
import type { Memory } from './memory.js';

/** Words an entry takes: its entity index, its archetype's id and its row. */
export const entryWords = 3;

/** A bucket record's words: its key's hash, its segment's first entry, length and capacity, then its key's words. */
export const recordHash = 0;
export const recordStart = 1;
export const recordLength = 2;
export const recordCapacity = 3;
export const recordKey = 4;

/** A freed bucket's capacity. */
const freedCapacity = 0xFFFFFFFF;

/**
 * A hash index: an open-addressing table of buckets by key, linear probing, at most half full, each slot a key's hash
 * and its bucket, so a probe reads one line until a hash matches; each bucket a record of its hash, segment and key,
 * its segment of one entries buffer with spare slots holding its entries in entity order. Every array is in the arena,
 * so other threads read it where the world's thread wrote it. By entity index, the bucket it's filed in, so its old
 * bucket is found without its old key.
 */
export type HashTable = {
    readonly memory: Memory;
    /** Words of a key, and of a bucket's record. */
    readonly words: number;
    readonly stride: number;
    /** By slot, two words: a bucket's hash and its id plus one, or 0 for none. */
    slots: Uint32Array;
    /** By bucket id: its record, and the tick an entity last entered, left or moved in it. */
    records: Uint32Array;
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

/** What lookups read of a hash table: on the world's thread the table, on a joined thread its views of it. */
export type HashView = Pick<HashTable, "words" | "stride" | "slots" | "records" | "ticks" | "cleared" | "entries"> & { readonly watched: ReadonlyMap<number, Float64Array> };

const minimumSlots = 16;

/** Slots the table keeps for each bucket at least: it's at most half full. */
const slotsPerBucket = 2;

/** Whether `slots` slots hold `buckets` buckets. */
export const slotsHold = (slots: number, buckets: number): boolean => slotsPerBucket * buckets + 2 <= slots;

export const createHashTable = (memory: Memory, words: number): HashTable => ({
    memory,
    words,
    stride: recordKey + words,
    slots: allocateArray(memory, Uint32Array, 2 * minimumSlots).fill(0),
    records: allocateArray(memory, Uint32Array, 8 * (recordKey + words)),
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
    for (const array of [table.slots, table.records, table.ticks, table.entries, table.bucketOf, ...table.watched.values()]) freeArray(memory, array);
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
export const coverBuckets = (table: HashTable, count: number): void => {
    const capacity = table.ticks.length;
    if (capacity >= count) return;
    const length = Math.max(count, 2 * capacity);
    const { memory, stride } = table;
    table.records = regrow(memory, table.records, Uint32Array, length * stride, capacity * stride, 0);
    table.ticks = regrow(memory, table.ticks, Float64Array, length, capacity, 0);
    for (const [component, ticks] of table.watched) table.watched.set(component, regrow(memory, ticks, Float64Array, length, capacity, 0));
};

/** A bucket's segment's first entry, length and capacity. */
export const startOf = (table: HashView, bucket: number): number => table.records[bucket * table.stride + recordStart];
export const lengthOf = (table: HashView, bucket: number): number => table.records[bucket * table.stride + recordLength];
const capacityOf = (table: HashTable, bucket: number): number => table.records[bucket * table.stride + recordCapacity];
const isFreed = (table: HashTable, bucket: number): boolean => capacityOf(table, bucket) === freedCapacity;

/** Whether bucket `bucket`'s key is the `words` of `key` from `at`. */
const sameKey = (table: HashView, bucket: number, key: Uint32Array, at: number): boolean => {
    const { records, words } = table;
    const base = bucket * table.stride + recordKey;
    for (let k = 0; k < words; k++) if (records[base + k] !== key[at + k]) return false;
    return true;
};

/** The bucket of a key, by its hash, or -1 when none holds it. */
export const findBucket = (table: HashView, key: Uint32Array, at: number, hash: number): number => {
    const { slots } = table;
    const mask = (slots.length >> 1) - 1;
    for (let slot = hash & mask; ; slot = (slot + 1) & mask) {
        const found = slots[2 * slot + 1];
        if (found === 0) return -1;
        if (slots[2 * slot] === hash && sameKey(table, found - 1, key, at)) return found - 1;
    }
};

/** Places a bucket in the table by its hash; the table has a free slot. */
export const place = (slots: Uint32Array, bucket: number, hash: number): void => {
    const mask = (slots.length >> 1) - 1;
    let slot = hash & mask;
    while (slots[2 * slot + 1] !== 0) slot = (slot + 1) & mask;
    slots[2 * slot] = hash;
    slots[2 * slot + 1] = bucket + 1;
};

/** Empties the table at a capacity for `buckets`. */
export const rehash = (table: HashTable, buckets: number): void => {
    let capacity = minimumSlots;
    while (!slotsHold(capacity, buckets)) capacity *= 2;
    if (2 * capacity !== table.slots.length) {
        freeArray(table.memory, table.slots);
        table.slots = allocateArray(table.memory, Uint32Array, 2 * capacity);
    }
    table.slots.fill(0);
};

/** Places every bucket not freed in the table again. */
export const placeAll = (table: HashTable): void => {
    const { records, stride } = table;
    for (let bucket = 0; bucket < table.count; bucket++) if (!isFreed(table, bucket)) place(table.slots, bucket, records[bucket * stride + recordHash]);
};

/** The bucket of a key, made empty when none holds it, with its tick at `tick`. */
export const bucketFor = (table: HashTable, key: Uint32Array, at: number, hash: number, tick: number): number => {
    const found = findBucket(table, key, at, hash);
    if (found >= 0) return found;
    const live = table.count - table.freed.length;
    if (!slotsHold(table.slots.length >> 1, live + 1)) {
        rehash(table, live + 1);
        placeAll(table);
    }
    const bucket = table.freed.pop() ?? table.count++;
    coverBuckets(table, table.count);
    const { records, words, stride } = table;
    const base = bucket * stride;
    records[base + recordHash] = hash;
    records[base + recordStart] = 0;
    records[base + recordLength] = 0;
    records[base + recordCapacity] = 0;
    for (let k = 0; k < words; k++) records[base + recordKey + k] = key[at + k];
    table.ticks[bucket] = tick;
    for (const ticks of table.watched.values()) ticks[bucket] = tick;
    table.empty++;
    place(table.slots, bucket, hash);
    return bucket;
};

/** Spare slots a segment of `length` entries gets: an eighth, at least 4. */
export const capacityFor = (length: number): number => length + Math.max(4, length >> 3);

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
    const base = bucket * table.stride;
    if (table.records[base + recordCapacity] >= length) return;
    const capacity = capacityFor(length);
    const start = allocateSegment(table, capacity);
    const { entries, records } = table;
    const from = records[base + recordStart] * entryWords;
    entries.copyWithin(start * entryWords, from, from + records[base + recordLength] * entryWords);
    table.garbage += records[base + recordCapacity];
    records[base + recordStart] = start;
    records[base + recordCapacity] = capacity;
};

/**
 * Moves `words` of entries, a multiple of `entryWords`, from `from` to `to` within one buffer: by hand, an entry a step,
 * when few, which a native call would cost more than.
 */
const move = (entries: Int32Array, to: number, from: number, words: number): void => {
    if (words > 96) {
        entries.copyWithin(to, from, from + words);
        return;
    }
    if (to < from) {
        for (let k = 0; k < words; k += 3) {
            entries[to + k] = entries[from + k];
            entries[to + k + 1] = entries[from + k + 1];
            entries[to + k + 2] = entries[from + k + 2];
        }
    }
    else {
        for (let k = words - 3; k >= 0; k -= 3) {
            entries[to + k + 2] = entries[from + k + 2];
            entries[to + k + 1] = entries[from + k + 1];
            entries[to + k] = entries[from + k];
        }
    }
};

/** Where entity index `index` is in a bucket, or where it would go, by binary search: `~position` when it isn't there. */
export const positionIn = (table: HashTable, bucket: number, index: number): number => {
    const { entries } = table;
    const base = startOf(table, bucket);
    let low = 0;
    let high = lengthOf(table, bucket);
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
    const at = (startOf(table, bucket) + position) * entryWords;
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
    const record = bucket * table.stride;
    const length = table.records[record + recordLength];
    const base = table.records[record + recordStart] * entryWords;
    move(table.entries, base + position * entryWords, base + (position + 1) * entryWords, (length - position - 1) * entryWords);
    table.records[record + recordLength] = length - 1;
    table.ticks[bucket] = tick;
    table.size--;
    countEmpty(table, length, length - 1);
};

/** Inserts entity index `index` at its archetype and row into a bucket, in entity order, stamping it. */
export const insertEntry = (table: HashTable, bucket: number, index: number, archetype: number, row: number, tick: number): void => {
    const record = bucket * table.stride;
    const length = table.records[record + recordLength];
    reserve(table, bucket, length + 1);
    const found = positionIn(table, bucket, index);
    const position = found < 0 ? ~found : found;
    const base = table.records[record + recordStart] * entryWords;
    const { entries } = table;
    move(entries, base + (position + 1) * entryWords, base + position * entryWords, (length - position) * entryWords);
    const at = base + position * entryWords;
    entries[at] = index;
    entries[at + 1] = archetype;
    entries[at + 2] = row;
    table.records[record + recordLength] = length + 1;
    table.ticks[bucket] = tick;
    table.size++;
    countEmpty(table, length, length + 1);
};

/**
 * Applies many removals and insertions to one bucket in one merge: `removed` entity indexes and `added` entries
 * (`entryWords` each), both in entity order. Keeps the bucket's entries in entity order.
 */
export const mergeEntries = (table: HashTable, bucket: number, removed: Int32Array, removedCount: number, added: Int32Array, addedCount: number, scratch: Int32Array, tick: number): void => {
    const record = bucket * table.stride;
    const length = table.records[record + recordLength];
    const result = length - removedCount + addedCount;
    const base = table.records[record + recordStart] * entryWords;
    // The bucket's current entries, copied out, merged back with the insertions, skipping the removals.
    scratch.set(table.entries.subarray(base, base + length * entryWords));
    reserve(table, bucket, result);
    const target = table.entries;
    let to = table.records[record + recordStart] * entryWords;
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
    table.records[record + recordLength] = result;
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
        const { records, stride } = table;
        for (let bucket = 0; bucket < table.count; bucket++) {
            const base = bucket * stride;
            if (records[base + recordCapacity] === freedCapacity || records[base + recordLength] > 0) continue;
            table.garbage += records[base + recordCapacity];
            records[base + recordCapacity] = freedCapacity;
            table.freed.push(bucket);
        }
        table.empty = 0;
        table.cleared = tick;
        rehash(table, live);
        placeAll(table);
    }
    if (table.garbage > Math.max(1024, table.used - table.garbage)) compact(table);
};

/** Lays every bucket's segment out again, one after another, with their spare slots. */
const compact = (table: HashTable): void => {
    const { records, stride } = table;
    let total = 0;
    for (let bucket = 0; bucket < table.count; bucket++) if (!isFreed(table, bucket)) total += capacityFor(records[bucket * stride + recordLength]);
    const old = table.entries;
    const entries = allocateArray(table.memory, Int32Array, Math.max(64, total) * entryWords);
    let used = 0;
    for (let bucket = 0; bucket < table.count; bucket++) {
        if (isFreed(table, bucket)) continue;
        const base = bucket * stride;
        const length = records[base + recordLength];
        const from = records[base + recordStart] * entryWords;
        entries.set(old.subarray(from, from + length * entryWords), used * entryWords);
        records[base + recordStart] = used;
        records[base + recordCapacity] = capacityFor(length);
        used += records[base + recordCapacity];
    }
    freeArray(table.memory, old);
    table.entries = entries;
    table.used = used;
    table.garbage = 0;
};

/**
 * Builds the table again from `count` entries in entity order: entity indexes, archetypes and rows (`entryWords` each
 * in `entries`), and their keys' words and hashes, with `bucketOfEntry` for scratch. Every bucket's tick, and every
 * watched tick, is `tick`.
 */
export const loadHashTable = (table: HashTable, count: number, entries: Int32Array, keys: Uint32Array, hashes: Uint32Array, bucketOfEntry: Int32Array, tick: number, entityCount: number): void => {
    const { words, stride } = table;
    coverEntities(table, entityCount);
    table.bucketOf.fill(-1);
    // Sized for as many buckets as it last held, growing as more are found, so the table is as small as its keys need.
    const expected = Math.min(count, Math.max(16, table.count - table.freed.length - table.empty));
    table.count = 0;
    table.freed.length = 0;
    table.empty = 0;
    table.cleared = tick;
    table.size = count;
    rehash(table, expected);
    coverBuckets(table, expected);
    for (let k = 0; k < count; k++) {
        const hash = hashes[k];
        let bucket = findBucket(table, keys, k * words, hash);
        if (bucket < 0) {
            if (!slotsHold(table.slots.length >> 1, table.count + 1)) {
                rehash(table, 2 * (table.count + 1));
                placeAll(table);
            }
            bucket = table.count++;
            coverBuckets(table, table.count);
            const base = bucket * stride;
            table.records[base + recordHash] = hash;
            table.records[base + recordLength] = 0;
            table.records[base + recordCapacity] = 0;
            for (let w = 0; w < words; w++) table.records[base + recordKey + w] = keys[k * words + w];
            place(table.slots, bucket, hash);
        }
        table.records[bucket * stride + recordLength]++;
        bucketOfEntry[k] = bucket;
    }
    const { records } = table;
    let used = 0;
    for (let bucket = 0; bucket < table.count; bucket++) {
        const base = bucket * stride;
        records[base + recordStart] = used;
        records[base + recordCapacity] = capacityFor(records[base + recordLength]);
        used += records[base + recordCapacity];
        records[base + recordLength] = 0;
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
        const base = bucketOfEntry[k] * stride;
        const at = (records[base + recordStart] + records[base + recordLength]++) * entryWords;
        target[at] = entries[k * entryWords];
        target[at + 1] = entries[k * entryWords + 1];
        target[at + 2] = entries[k * entryWords + 2];
        table.bucketOf[entries[k * entryWords]] = bucketOfEntry[k];
    }
};

/** Starts keeping, by bucket, the newest tick a watched component may have changed in a row there, at `tick`. */
export const watchHashComponent = (table: HashTable, component: number, tick: number): void => {
    if (table.watched.has(component)) return;
    table.watched.set(component, allocateArray(table.memory, Float64Array, table.ticks.length).fill(tick));
};

/** Stops keeping a watched component's ticks. */
export const unwatchHashComponent = (table: HashTable, component: number): void => {
    const ticks = table.watched.get(component);
    if (ticks === undefined) return;
    freeArray(table.memory, ticks);
    table.watched.delete(component);
};
