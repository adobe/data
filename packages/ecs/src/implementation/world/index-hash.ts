// © 2026 Adobe. MIT License. See /LICENSE for details.
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
 * its segment of one entries buffer with spare slots holding its entries in entity order. Every array readers use is
 * in the arena, so other threads read it where the world's thread wrote it. By entity index, the bucket it's filed in,
 * so its old bucket is found without its old key.
 *
 * A change to a bucket of at least `unsortedMinimum` entries, in an index that isn't unique, may leave it unsorted:
 * its entries in entity order up to its tail, with holes where entries left (archetype -1, the entity index kept for
 * binary search), then a tail of entries appended in any order, each one's position kept by entity index. Its
 * record's length counts its entries, not its holes, so reading `length` needs no order. It's sorted before anything
 * reads its entries by position: on the world's thread by a list's `at`, and every unsorted bucket before the index's
 * arrays are handed to a kernel or another thread; when its segment is full and has holes, which sorting closes in
 * place; and once its holes and tail pass four times its entries. A segment an unsorted bucket outgrows gets half its
 * length more spare slots, so sorts to make room come once every so many changes, O(1) amortized each. What only
 * unsorted buckets use is the world's thread's alone, outside the arena.
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
    /** How many buckets are unsorted, and a list holding each of them, and some sorted since. */
    unsorted: number;
    unsortedBuckets: Int32Array;
    unsortedListed: number;
    /**
     * By bucket id: where its tail starts, or -1 when it's sorted; the slots its entries and holes take; and a position
     * no hole is before.
     */
    tails: Int32Array;
    extents: Int32Array;
    holes: Int32Array;
    /** By entity index: its position in its bucket's tail, valid only while it's there. */
    positionOf: Int32Array;
    /** Scratch for sorting a tail: twice its words. */
    spare: Int32Array;
    /** The entries as 8-byte words, and a scratch as 8- and 4-byte words, for long moves (`moveWide`). */
    wide: Float64Array;
    scratch: Float64Array;
    scratchWords: Int32Array;
};

/** What lookups read of a hash table: on the world's thread the table, on a joined thread its views of it. */
export type HashView = Pick<HashTable, "words" | "stride" | "slots" | "records" | "ticks" | "cleared" | "entries" | "unsorted"> & { readonly watched: ReadonlyMap<number, Float64Array> };

/** Whether a view is the world's table itself, whose unsorted buckets a list sorts before reading them by position. */
export const isHashTable = (view: HashView): view is HashTable => "tails" in view;

const minimumSlots = 16;

/** Slots the table keeps for each bucket at least: it's at most half full. */
const slotsPerBucket = 2;

/** Entries a bucket holds at least before a change may leave it unsorted; a shorter one shifts its entries. */
export const unsortedMinimum = 64;

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
    unsorted: 0,
    unsortedBuckets: new Int32Array(8),
    unsortedListed: 0,
    tails: new Int32Array(8).fill(-1),
    extents: new Int32Array(8),
    holes: new Int32Array(8),
    positionOf: new Int32Array(64),
    spare: new Int32Array(0),
    wide: new Float64Array(0),
    scratch: new Float64Array(0),
    scratchWords: new Int32Array(0),
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

/** A copy of `array`, `length` long, the rest filled with `fill`. */
const grown = (array: Int32Array, length: number, fill: number): Int32Array => {
    const copy = new Int32Array(length);
    copy.set(array);
    if (fill !== 0) copy.fill(fill, array.length);
    return copy;
};

/** Grows what's by entity index to cover `length` indexes. */
export const coverEntities = (table: HashTable, length: number): void => {
    if (table.bucketOf.length >= length) return;
    table.bucketOf = regrow(table.memory, table.bucketOf, Int32Array, Math.max(length, 2 * table.bucketOf.length), table.bucketOf.length, -1);
    table.positionOf = grown(table.positionOf, table.bucketOf.length, 0);
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
    table.tails = grown(table.tails, length, -1);
    table.extents = grown(table.extents, length, 0);
    table.holes = grown(table.holes, length, 0);
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

/** The slots a bucket's entries take, with an unsorted one's holes. */
const extentOf = (table: HashTable, bucket: number): number => table.tails[bucket] < 0 ? lengthOf(table, bucket) : table.extents[bucket];

/**
 * Gives a bucket room for `slots` slots, moving its segment to the end of the buffer when they don't fit; an unsorted
 * one's gets half as many again spare, since its tail grows into them.
 */
const reserve = (table: HashTable, bucket: number, slots: number): void => {
    const base = bucket * table.stride;
    if (table.records[base + recordCapacity] >= slots) return;
    const capacity = capacityFor(slots) + (table.tails[bucket] >= 0 ? slots >> 1 : 0);
    const kept = extentOf(table, bucket);
    const start = allocateSegment(table, capacity);
    const { records } = table;
    move(table, start * entryWords, records[base + recordStart] * entryWords, kept * entryWords);
    table.garbage += records[base + recordCapacity];
    records[base + recordStart] = start;
    records[base + recordCapacity] = capacity;
};

/** The table's entries as 8-byte words, made again when its entries were. */
const wideOf = (table: HashTable): Float64Array => {
    const { entries } = table;
    // Its last 8-byte word may take 4 bytes past the entries, which are in its block: blocks are 64-byte aligned.
    const length = (entries.length + 1) >> 1;
    if (table.wide.buffer !== entries.buffer || table.wide.byteOffset !== entries.byteOffset || table.wide.length !== length) {
        table.wide = new Float64Array(entries.buffer, entries.byteOffset, length);
    }
    return table.wide;
};

/** Scratch of at least `words` 4-byte words, as 4- and 8-byte words. */
const scratchOf = (table: HashTable, words: number): Float64Array => {
    if (2 * table.scratch.length < words) {
        table.scratch = new Float64Array(Math.max((words + 1) >> 1, 2 * table.scratch.length));
        table.scratchWords = new Int32Array(table.scratch.buffer);
    }
    return table.scratch;
};

/**
 * Moves `words` of entries from `from` to `to` in a table's buffer. Shared memory copies an element at a time, so a
 * long move copies 8-byte words, 8 times faster than 4-byte ones: directly when both ends have the same parity, an
 * edge word by hand; else through a scratch, which shifts them by a word, the target's edge words kept.
 */
const moveWide = (table: HashTable, to: number, from: number, words: number): void => {
    const { entries } = table;
    if (!table.memory.shared) {
        entries.copyWithin(to, from, from + words);
        return;
    }
    const wide = wideOf(table);
    if (((to ^ from) & 1) === 0) {
        const odd = from & 1;
        const even = (words - odd) & ~1;
        const rest = words - odd - even;
        if (to < from) {
            if (odd === 1) entries[to] = entries[from];
            wide.copyWithin((to + odd) >> 1, (from + odd) >> 1, (from + odd + even) >> 1);
            if (rest === 1) entries[to + words - 1] = entries[from + words - 1];
        }
        else {
            if (rest === 1) entries[to + words - 1] = entries[from + words - 1];
            wide.copyWithin((to + odd) >> 1, (from + odd) >> 1, (from + odd + even) >> 1);
            if (odd === 1) entries[to] = entries[from];
        }
        return;
    }
    const sourceFirst = from & ~1;
    const sourceEnd = (from + words + 1) & ~1;
    const targetFirst = to & ~1;
    const targetEnd = (to + words + 1) & ~1;
    const scratch = scratchOf(table, Math.max(sourceEnd - sourceFirst, targetEnd - targetFirst) + 2);
    const scratchWords = table.scratchWords;
    scratch.set(wide.subarray(sourceFirst >> 1, sourceEnd >> 1));
    scratchWords.copyWithin(to - targetFirst, from - sourceFirst, from - sourceFirst + words);
    if ((to & 1) === 1) scratchWords[0] = entries[targetFirst];
    if (((to + words) & 1) === 1) scratchWords[targetEnd - targetFirst - 1] = entries[to + words];
    wide.set(scratch.subarray(0, (targetEnd - targetFirst) >> 1), targetFirst >> 1);
};

/**
 * Moves `words` of entries, a multiple of `entryWords`, from `from` to `to` within a table's buffer: by hand, an entry
 * a step, when few, which a native call would cost more than.
 */
const move = (table: HashTable, to: number, from: number, words: number): void => {
    const { entries } = table;
    if (words > 96) {
        moveWide(table, to, from, words);
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

/**
 * Where entity index `index` is among the `end` entries in entity order from entry `start`, holes included, or where it
 * would go, by binary search: `~position` when it isn't there.
 */
const search = (entries: Int32Array, start: number, end: number, index: number): number => {
    let low = 0;
    let high = end;
    while (low < high) {
        const middle = (low + high) >>> 1;
        const at = entries[(start + middle) * entryWords];
        if (at < index) low = middle + 1;
        else if (at > index) high = middle;
        else return middle;
    }
    return ~low;
};

/** Where entity index `index`'s entry is in a bucket, or -1 when it isn't there. */
const findEntry = (table: HashTable, bucket: number, index: number): number => {
    const { entries } = table;
    const start = startOf(table, bucket);
    const tail = table.tails[bucket];
    if (tail < 0) {
        const position = search(entries, start, lengthOf(table, bucket), index);
        return position < 0 ? -1 : position;
    }
    const position = table.positionOf[index];
    if (position >= tail && position < table.extents[bucket] && entries[(start + position) * entryWords] === index) return position;
    const found = search(entries, start, tail, index);
    return found >= 0 && entries[(start + found) * entryWords + 1] >= 0 ? found : -1;
};

/** Updates where entity index `index` is: its archetype and row, in the bucket it's filed in. */
export const relocate = (table: HashTable, bucket: number, index: number, archetype: number, row: number): void => {
    const position = findEntry(table, bucket, index);
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

/** Marks a sorted bucket unsorted, with an empty tail and no holes, listing it. */
const unsort = (table: HashTable, bucket: number): void => {
    const length = lengthOf(table, bucket);
    table.tails[bucket] = length;
    table.extents[bucket] = length;
    table.holes[bucket] = length;
    table.unsorted++;
    let listed = table.unsortedListed;
    // The list drops the buckets sorted since they were listed once they're most of it.
    if (listed >= 2 * table.unsorted + 8) {
        const list = table.unsortedBuckets;
        let kept = 0;
        for (let k = 0; k < listed; k++) if (table.tails[list[k]] >= 0) list[kept++] = list[k];
        listed = kept;
    }
    if (listed === table.unsortedBuckets.length) table.unsortedBuckets = grown(table.unsortedBuckets, 2 * listed, 0);
    table.unsortedBuckets[listed] = bucket;
    table.unsortedListed = listed + 1;
};

/** Marks an unsorted bucket sorted. */
const sorted = (table: HashTable, bucket: number): void => {
    table.tails[bucket] = -1;
    if (--table.unsorted === 0) table.unsortedListed = 0;
};

/**
 * After a change to an unsorted bucket: sorted when it's empty or in order, or once its holes and tail pass four times
 * its entries and 64 more, which bounds what a bucket nothing reads by position keeps.
 */
const settle = (table: HashTable, bucket: number): void => {
    const length = lengthOf(table, bucket);
    const extent = table.extents[bucket];
    const tail = table.tails[bucket];
    if (length === 0 || (extent === length && tail === extent)) sorted(table, bucket);
    else if (2 * extent - length - tail > (length << 2) + unsortedMinimum) sortBucket(table, bucket);
};

/** Removes entity index `index` from a bucket, stamping it; a long one may be left unsorted when `unsorting`. */
export const removeEntry = (table: HashTable, bucket: number, index: number, tick: number, unsorting: boolean): void => {
    const record = bucket * table.stride;
    const length = table.records[record + recordLength];
    const start = table.records[record + recordStart];
    const { entries } = table;
    const tail = table.tails[bucket];
    if (tail < 0) {
        const position = search(entries, start, length, index);
        if (position < 0) return;
        if (position < length - 1) {
            if (!unsorting || length < unsortedMinimum) {
                const base = start * entryWords;
                move(table, base + position * entryWords, base + (position + 1) * entryWords, (length - position - 1) * entryWords);
            }
            else {
                unsort(table, bucket);
                entries[(start + position) * entryWords + 1] = -1;
                table.holes[bucket] = position;
            }
        }
    }
    else {
        const extent = table.extents[bucket];
        const position = table.positionOf[index];
        if (position >= tail && position < extent && entries[(start + position) * entryWords] === index) {
            // Out of the tail, its last entry taking its place.
            const at = (start + position) * entryWords;
            const last = (start + extent - 1) * entryWords;
            if (at !== last) {
                entries[at] = entries[last];
                entries[at + 1] = entries[last + 1];
                entries[at + 2] = entries[last + 2];
                table.positionOf[entries[at]] = position;
            }
            table.extents[bucket] = extent - 1;
        }
        else {
            const found = search(entries, start, tail, index);
            if (found < 0 || entries[(start + found) * entryWords + 1] < 0) return;
            if (found === tail - 1 && tail === extent) {
                table.tails[bucket] = tail - 1;
                table.extents[bucket] = extent - 1;
                table.holes[bucket] = Math.min(table.holes[bucket], tail - 1);
            }
            else {
                entries[(start + found) * entryWords + 1] = -1;
                table.holes[bucket] = Math.min(table.holes[bucket], found);
            }
        }
    }
    table.records[record + recordLength] = length - 1;
    table.ticks[bucket] = tick;
    table.size--;
    countEmpty(table, length, length - 1);
    if (table.tails[bucket] >= 0) settle(table, bucket);
};

/** Appends an entry to an unsorted bucket's tail. */
const appendTail = (table: HashTable, bucket: number, index: number, archetype: number, row: number): void => {
    const extent = table.extents[bucket];
    reserve(table, bucket, extent + 1);
    const at = (startOf(table, bucket) + extent) * entryWords;
    const { entries } = table;
    entries[at] = index;
    entries[at + 1] = archetype;
    entries[at + 2] = row;
    table.positionOf[index] = extent;
    table.extents[bucket] = extent + 1;
};

/**
 * Inserts entity index `index`, which the bucket doesn't hold, at its archetype and row, stamping it: in entity order,
 * or when `unsorting`, into a long bucket's tail, or the hole it left.
 */
export const insertEntry = (table: HashTable, bucket: number, index: number, archetype: number, row: number, tick: number, unsorting: boolean): void => {
    const record = bucket * table.stride;
    const length = table.records[record + recordLength];
    // A full unsorted bucket with holes closes them in place rather than moving its segment to grow it.
    if (table.tails[bucket] >= 0 && table.extents[bucket] > length && table.extents[bucket] >= table.records[record + recordCapacity]) sortBucket(table, bucket);
    const tail = table.tails[bucket];
    if (tail < 0) {
        reserve(table, bucket, length + 1);
        const start = table.records[record + recordStart];
        const { entries } = table;
        const after = length === 0 || entries[(start + length - 1) * entryWords] < index;
        if (after || !unsorting || length < unsortedMinimum) {
            const found = after ? ~length : search(entries, start, length, index);
            const position = found < 0 ? ~found : found;
            const base = start * entryWords;
            move(table, base + (position + 1) * entryWords, base + position * entryWords, (length - position) * entryWords);
            const at = base + position * entryWords;
            entries[at] = index;
            entries[at + 1] = archetype;
            entries[at + 2] = row;
        }
        else {
            unsort(table, bucket);
            appendTail(table, bucket, index, archetype, row);
        }
    }
    else {
        const start = table.records[record + recordStart];
        const { entries } = table;
        const extent = table.extents[bucket];
        const found = search(entries, start, tail, index);
        if (found >= 0) {
            // The hole it left.
            const at = (start + found) * entryWords;
            entries[at + 1] = archetype;
            entries[at + 2] = row;
        }
        else if (~found === tail && tail === extent) {
            // After every entry in order, with no tail: still in order.
            reserve(table, bucket, extent + 1);
            const at = (startOf(table, bucket) + extent) * entryWords;
            table.entries[at] = index;
            table.entries[at + 1] = archetype;
            table.entries[at + 2] = row;
            if (table.holes[bucket] === tail) table.holes[bucket] = tail + 1;
            table.tails[bucket] = tail + 1;
            table.extents[bucket] = extent + 1;
        }
        else appendTail(table, bucket, index, archetype, row);
    }
    table.records[record + recordLength] = length + 1;
    table.ticks[bucket] = tick;
    table.size++;
    countEmpty(table, length, length + 1);
    if (table.tails[bucket] >= 0) settle(table, bucket);
};

/** Copies entry `from` of `source` to entry `to` of `target`. */
const copyEntry = (target: Int32Array, to: number, source: Int32Array, from: number): void => {
    target[to * entryWords] = source[from * entryWords];
    target[to * entryWords + 1] = source[from * entryWords + 1];
    target[to * entryWords + 2] = source[from * entryWords + 2];
};

/**
 * Sorts `count` entries by entity index, the first `count * entryWords` words of `spare`, which holds twice that: runs
 * of eight by insertion, then merged in passes between its halves.
 */
const sortEntries = (spare: Int32Array, count: number): void => {
    const run = 8;
    for (let low = 0; low < count; low += run) {
        for (let k = low + 1, high = Math.min(count, low + run); k < high; k++) {
            const index = spare[k * entryWords];
            const archetype = spare[k * entryWords + 1];
            const row = spare[k * entryWords + 2];
            let at = k;
            while (at > low && spare[(at - 1) * entryWords] > index) {
                copyEntry(spare, at, spare, at - 1);
                at--;
            }
            spare[at * entryWords] = index;
            spare[at * entryWords + 1] = archetype;
            spare[at * entryWords + 2] = row;
        }
    }
    let from = 0;
    let to = count;
    for (let width = run; width < count; width *= 2) {
        for (let low = 0; low < count; low += 2 * width) {
            const middle = Math.min(low + width, count);
            const high = Math.min(low + 2 * width, count);
            let a = low;
            let b = middle;
            for (let k = low; k < high; k++) {
                if (b >= high || (a < middle && spare[(from + a) * entryWords] <= spare[(from + b) * entryWords])) copyEntry(spare, to + k, spare, from + a++);
                else copyEntry(spare, to + k, spare, from + b++);
            }
        }
        const swap = from;
        from = to;
        to = swap;
    }
    if (from !== 0) spare.copyWithin(0, from * entryWords, (from + count) * entryWords);
};

/**
 * Puts an unsorted bucket's entries in entity order again: its tail sorted aside, its holes closed from the first, and
 * the tail merged in from the end, so only the entries past the first hole and the first tail entry's place move.
 */
export const sortBucket = (table: HashTable, bucket: number): void => {
    const tail = table.tails[bucket];
    const extent = table.extents[bucket];
    const start = startOf(table, bucket);
    const { entries } = table;
    const count = extent - tail;
    if (table.spare.length < 2 * count * entryWords) table.spare = new Int32Array(Math.max(2 * count * entryWords, 2 * table.spare.length));
    const { spare } = table;
    for (let k = 0; k < count; k++) copyEntry(spare, k, entries, start + tail + k);
    sortEntries(spare, count);
    // Holes closed, a run of entries at a time; past the last hole, the rest in one move.
    let left = extent - lengthOf(table, bucket);
    let write = Math.min(table.holes[bucket], tail);
    let read = write;
    while (read < tail) {
        if (left === 0) {
            if (write !== read) move(table, (start + write) * entryWords, (start + read) * entryWords, (tail - read) * entryWords);
            write += tail - read;
            break;
        }
        if (entries[(start + read) * entryWords + 1] < 0) {
            read++;
            left--;
            continue;
        }
        let end = read + 1;
        while (end < tail && entries[(start + end) * entryWords + 1] >= 0) end++;
        if (write !== read) move(table, (start + write) * entryWords, (start + read) * entryWords, (end - read) * entryWords);
        write += end - read;
        read = end;
    }
    // The tail merged in from the end: each of its entries, from the last, after the run of entries above it.
    let kept = write;
    for (let k = count - 1; k >= 0; k--) {
        const index = spare[k * entryWords];
        const found = search(entries, start, kept, index);
        const position = found < 0 ? ~found : found;
        const to = position + k + 1;
        if (kept > position) move(table, (start + to) * entryWords, (start + position) * entryWords, (kept - position) * entryWords);
        copyEntry(entries, start + position + k, spare, k);
        kept = position;
    }
    sorted(table, bucket);
};

/** Sorts every unsorted bucket, before the table's arrays are handed to a reader that reads entries by position. */
export const sortHashTable = (table: HashTable): void => {
    const list = table.unsortedBuckets;
    for (let k = 0; k < table.unsortedListed && table.unsorted > 0; k++) if (table.tails[list[k]] >= 0) sortBucket(table, list[k]);
    table.unsortedListed = 0;
};

/** Forgets every unsorted bucket, before the table is built again. */
export const forgetUnsorted = (table: HashTable): void => {
    const list = table.unsortedBuckets;
    for (let k = 0; k < table.unsortedListed; k++) table.tails[list[k]] = -1;
    table.unsorted = 0;
    table.unsortedListed = 0;
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

/** Lays every bucket's segment out again, one after another, with their spare slots, each sorted first. */
const compact = (table: HashTable): void => {
    sortHashTable(table);
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
    forgetUnsorted(table);
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
