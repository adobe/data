import { allocateArray, freeArray } from './arrays.js';
import { compareObjects, type KeyPart } from './index-keys.js';
import type { Memory } from './memory.js';

/** Entries a block holds at most, and how full a rebuild leaves each. */
export const blockEntries = 128;
const builtEntries = 96;

/**
 * A sorted index: its entries in key order, then entity order, in blocks of at most `blockEntries`, each a segment of
 * one buffer; `order` lists the blocks in key order. An entry is its key's words, its entity index, its archetype's id
 * and its row. Positions count entries from the first: a Fenwick tree over the blocks' lengths finds a block's first
 * position, and a block by position, in O(log blocks). Ticks are kept by block, with a tree of their maximum over
 * ranges of blocks, so whether a range changed is O(log blocks). Every array but the trees' scratch is in the arena,
 * so other threads read it where the world's thread wrote it.
 */
export type SortedTable = {
    readonly memory: Memory;
    readonly words: number;
    /** Words of an entry: the key's, then entity index, archetype and row. */
    readonly stride: number;
    readonly parts: readonly KeyPart[];
    /** Whether a part's values are compared as objects rather than by their words. */
    readonly objects: boolean;
    entries: Uint32Array;
    /** By block id: its length and the tick an entity last entered, left or moved in it. */
    lengths: Int32Array;
    ticks: Float64Array;
    /** Block ids in key order, how many, and those freed; by block id, its position in `order`. */
    order: Int32Array;
    positions: Int32Array;
    blocks: number;
    readonly freed: number[];
    /** Block ids allocated, used or freed. */
    allocated: number;
    /** By position in `order`: the Fenwick tree of lengths, one-based. */
    counts: Int32Array;
    /** Segment trees of ticks by position in `order`: membership, and by watched component. */
    tree: Float64Array;
    readonly watched: Map<number, { ticks: Float64Array; tree: Float64Array }>;
    /** Leaves of the segment trees: the least power of two at least `blocks`. */
    leaves: number;
    /**
     * By position in `order`: the key's words and the entity index of its block's last entry, `words + 1` each, so a
     * search over blocks reads one compact array rather than a line of each block.
     */
    fences: Uint32Array;
    /** By entity index: its block id, or -1. */
    blockOf: Int32Array;
    size: number;
    /** The newest tick at which its last entry left, which a range of an empty table counts as changed at. */
    cleared: number;
};

/** What lookups read of a sorted table: on the world's thread the table, on a joined thread its views of it. */
export type SortedView = Pick<SortedTable, "words" | "stride" | "parts" | "objects" | "entries" | "lengths" | "order" | "blocks" | "counts" | "tree" | "leaves" | "fences" | "size" | "cleared">
    & { readonly watched: ReadonlyMap<number, { readonly tree: Float64Array }> };

const minimumBlocks = 8;

export const createSortedTable = (memory: Memory, words: number, parts: readonly KeyPart[]): SortedTable => ({
    memory,
    words,
    stride: words + 3,
    parts,
    objects: parts.some(part => part.kind === "object"),
    entries: allocateArray(memory, Uint32Array, minimumBlocks * blockEntries * (words + 3)),
    lengths: allocateArray(memory, Int32Array, minimumBlocks).fill(0),
    ticks: allocateArray(memory, Float64Array, minimumBlocks).fill(0),
    order: allocateArray(memory, Int32Array, minimumBlocks),
    positions: allocateArray(memory, Int32Array, minimumBlocks),
    blocks: 0,
    freed: [],
    allocated: 0,
    counts: allocateArray(memory, Int32Array, minimumBlocks + 1).fill(0),
    tree: allocateArray(memory, Float64Array, 2 * minimumBlocks).fill(0),
    watched: new Map(),
    leaves: minimumBlocks,
    fences: allocateArray(memory, Uint32Array, minimumBlocks * (words + 1)),
    blockOf: allocateArray(memory, Int32Array, 64).fill(-1),
    size: 0,
    cleared: 0,
});

export const releaseSortedTable = (table: SortedTable): void => {
    const { memory } = table;
    for (const array of [table.entries, table.lengths, table.ticks, table.order, table.positions, table.counts, table.tree, table.fences, table.blockOf]) freeArray(memory, array);
    for (const { ticks, tree } of table.watched.values()) {
        freeArray(memory, ticks);
        freeArray(memory, tree);
    }
    table.watched.clear();
};

const regrow = <T extends Int32Array | Uint32Array | Float64Array>(memory: Memory, array: T, constructor: { new(buffer: ArrayBufferLike, byteOffset: number, length: number): T; readonly BYTES_PER_ELEMENT: number }, length: number, used: number, fill: number): T => {
    const grown = allocateArray(memory, constructor, length);
    grown.set(array.subarray(0, used));
    grown.fill(fill, used);
    freeArray(memory, array);
    return grown;
};

/** Grows what's by entity index to cover `length` indexes. */
export const coverSortedEntities = (table: SortedTable, length: number): void => {
    if (table.blockOf.length >= length) return;
    table.blockOf = regrow(table.memory, table.blockOf, Int32Array, Math.max(length, 2 * table.blockOf.length), table.blockOf.length, -1);
};

/** Grows what's by block id and by position to hold `count` blocks. */
const coverBlocks = (table: SortedTable, count: number): void => {
    const capacity = table.lengths.length;
    if (capacity >= count) return;
    const length = Math.max(count, 2 * capacity);
    const { memory, stride } = table;
    table.entries = regrow(memory, table.entries, Uint32Array, length * blockEntries * stride, capacity * blockEntries * stride, 0);
    table.lengths = regrow(memory, table.lengths, Int32Array, length, capacity, 0);
    table.ticks = regrow(memory, table.ticks, Float64Array, length, capacity, 0);
    table.order = regrow(memory, table.order, Int32Array, length, capacity, 0);
    table.positions = regrow(memory, table.positions, Int32Array, length, capacity, 0);
    table.fences = regrow(memory, table.fences, Uint32Array, length * (table.words + 1), capacity * (table.words + 1), 0);
    for (const watch of table.watched.values()) watch.ticks = regrow(memory, watch.ticks, Float64Array, length, capacity, 0);
};

/** A new block id, its length 0 and its tick `tick`. */
const allocateBlock = (table: SortedTable, tick: number): number => {
    const reused = table.freed.pop();
    const block = reused ?? table.allocated++;
    coverBlocks(table, table.allocated);
    table.lengths[block] = 0;
    table.ticks[block] = tick;
    for (const { ticks } of table.watched.values()) ticks[block] = tick;
    return block;
};

/** The first word of block `block`'s entries. */
export const blockBase = (table: SortedView, block: number): number => block * blockEntries * table.stride;

// Fenwick tree of the blocks' lengths, by position in `order`.

/** Rebuilds the Fenwick tree and the segment trees from the blocks in `order`, as a block was added or removed. */
const reindex = (table: SortedTable): void => {
    const { blocks, order, lengths } = table;
    if (table.counts.length < blocks + 1) {
        freeArray(table.memory, table.counts);
        table.counts = allocateArray(table.memory, Int32Array, Math.max(blocks + 1, 2 * table.counts.length));
    }
    const { counts, positions } = table;
    counts.fill(0, 0, blocks + 1);
    for (let k = 0; k < blocks; k++) {
        positions[order[k]] = k;
        fence(table, k);
    }
    for (let k = 0; k < blocks; k++) {
        const node = k + 1;
        counts[node] += lengths[order[k]];
        const parent = node + (node & -node);
        if (parent <= blocks) counts[parent] += counts[node];
    }
    let leaves = minimumBlocks;
    while (leaves < blocks) leaves *= 2;
    if (leaves !== table.leaves || table.tree.length !== 2 * leaves) {
        table.leaves = leaves;
        freeArray(table.memory, table.tree);
        table.tree = allocateArray(table.memory, Float64Array, 2 * leaves);
        for (const watch of table.watched.values()) {
            freeArray(table.memory, watch.tree);
            watch.tree = allocateArray(table.memory, Float64Array, 2 * leaves);
        }
    }
    buildTree(table, table.tree, table.ticks);
    for (const watch of table.watched.values()) buildTree(table, watch.tree, watch.ticks);
};

/** A segment tree of the maximum of `ticks` by block, over positions in `order`. */
const buildTree = (table: SortedTable, tree: Float64Array, ticks: Float64Array): void => {
    const { leaves, blocks, order } = table;
    tree.fill(0);
    for (let k = 0; k < blocks; k++) tree[leaves + k] = ticks[order[k]];
    for (let node = leaves - 1; node >= 1; node--) tree[node] = Math.max(tree[2 * node], tree[2 * node + 1]);
};

/** Copies the last entry's key and entity index of the block at position `k` into its fence. */
const fence = (table: SortedTable, k: number): void => {
    const block = table.order[k];
    const length = table.lengths[block];
    if (length === 0) return;
    const { entries, fences, words } = table;
    const from = blockBase(table, block) + (length - 1) * table.stride;
    const to = k * (words + 1);
    for (let w = 0; w <= words; w++) fences[to + w] = entries[from + w];
};

/** Adds `delta` to the length of the block at position `k`. */
const addCount = (table: SortedTable, k: number, delta: number): void => {
    const { counts, blocks } = table;
    for (let node = k + 1; node <= blocks; node += node & -node) counts[node] += delta;
};

/** The position of the first entry of the block at position `k`: the lengths of the blocks before it. */
export const firstPosition = (table: SortedView, k: number): number => {
    let sum = 0;
    for (let node = k; node > 0; node -= node & -node) sum += table.counts[node];
    return sum;
};

/** The position in `order` of the block holding entry position `position`, where `position < size`; or `blocks`. */
export const blockAt = (table: SortedView, position: number): number => {
    const { counts, blocks } = table;
    let k = 0;
    let remaining = position;
    let step = 1;
    while (step * 2 <= blocks) step *= 2;
    for (; step > 0; step >>= 1) {
        const next = k + step;
        if (next <= blocks && counts[next] <= remaining) {
            k = next;
            remaining -= counts[next];
        }
    }
    return k;
};

/** Stamps the block at position `k`, and its tree. */
const stamp = (table: SortedTable, k: number, tick: number): void => {
    table.ticks[table.order[k]] = tick;
    const { tree } = table;
    for (let node = table.leaves + k; node >= 1; node >>= 1) if (tree[node] < tick) tree[node] = tick;
};

/** Stamps a watched component's tick of the block at position `k`. */
export const stampWatched = (table: SortedTable, component: number, block: number, tick: number): void => {
    const watch = table.watched.get(component);
    if (watch === undefined) return;
    watch.ticks[block] = tick;
};

/** The largest of a tree's ticks over positions `from` to `to`, inclusive. */
export const treeMaximum = (table: SortedView, tree: Float64Array, from: number, to: number): number => {
    let maximum = 0;
    for (let low = from + table.leaves, high = to + table.leaves + 1; low < high; low >>= 1, high >>= 1) {
        if ((low & 1) === 1) maximum = Math.max(maximum, tree[low++]);
        if ((high & 1) === 1) maximum = Math.max(maximum, tree[--high]);
    }
    return maximum;
};

/** The positions in `order` of the blocks of a watched component's changes, folded into its tree; called once a refresh stamped them. */
export const refreshWatchedTree = (table: SortedTable, component: number): void => {
    const watch = table.watched.get(component);
    if (watch !== undefined) buildTree(table, watch.tree, watch.ticks);
};

// Comparing keys.

/**
 * Compares the first `count` words of a key in `words` at `base`, an entry's or a fence's, with `probe`'s: by word,
 * an object part by its value, the probe's being `values[part]`. Negative when the key is before the probe.
 */
export const compareKey = (table: SortedView, words: Uint32Array, base: number, probe: Uint32Array, values: readonly unknown[], count: number): number => {
    if (!table.objects) {
        for (let k = 0; k < count; k++) {
            const a = words[base + k];
            const b = probe[k];
            if (a !== b) return a < b ? -1 : 1;
        }
        return 0;
    }
    const { parts } = table;
    for (let p = 0; p < parts.length; p++) {
        const part = parts[p];
        if (part.first >= count) return 0;
        if (part.kind === "object") {
            const order = compareObjects(part.interned.values[words[base + part.first]], values[p]);
            if (order !== 0) return order;
            continue;
        }
        if (part.kind === "constant") continue;
        for (let k = part.first, end = Math.min(count, part.first + part.words); k < end; k++) {
            const a = words[base + k];
            const b = probe[k];
            if (a !== b) return a < b ? -1 : 1;
        }
    }
    return 0;
};

/** A key and entity index in `words` at `base` compared with a probe of a whole key and an entity index, as their order is: key, then entity. */
const compareEntry = (table: SortedTable, words: Uint32Array, base: number, probe: Uint32Array, values: readonly unknown[], entity: number): number => {
    const order = compareKey(table, words, base, probe, values, table.words);
    if (order !== 0) return order;
    const other = words[base + table.words];
    return other === entity ? 0 : other < entity ? -1 : 1;
};

/**
 * The first position whose entry's first `count` key words are after `probe`'s (`after`) or not before them: by
 * binary search over the fences, then within a block. Returns the block's position in `order` and the offset in it,
 * in `found`.
 */
export const bound = (table: SortedView, probe: Uint32Array, values: readonly unknown[], count: number, after: boolean, found: { k: number; offset: number }): void => {
    if (!table.objects) {
        boundWords(table, probe, count, after ? 1 : 0, found);
        return;
    }
    const { order, lengths, stride, fences, entries } = table;
    const fenceWords = table.words + 1;
    // The first block whose last entry passes, since every entry before it doesn't.
    let low = 0;
    let high = table.blocks;
    while (low < high) {
        const middle = (low + high) >>> 1;
        const compared = compareKey(table, fences, middle * fenceWords, probe, values, count);
        if (after ? compared > 0 : compared >= 0) high = middle;
        else low = middle + 1;
    }
    found.k = low;
    if (low === table.blocks) {
        found.offset = 0;
        return;
    }
    const block = order[low];
    const base = blockBase(table, block);
    let first = 0;
    let last = lengths[block];
    while (first < last) {
        const middle = (first + last) >>> 1;
        const compared = compareKey(table, entries, base + middle * stride, probe, values, count);
        if (after ? compared > 0 : compared >= 0) last = middle;
        else first = middle + 1;
    }
    found.offset = first;
};

/**
 * `bound` for keys of words alone: a key passes when its first `count` words, compared word by word, are after the
 * probe's, or with `after` 0, not before them.
 */
const boundWords = (table: SortedView, probe: Uint32Array, count: number, after: number, found: { k: number; offset: number }): void => {
    const { order, lengths, stride, fences, entries } = table;
    const fenceWords = table.words + 1;
    let low = 0;
    let high = table.blocks;
    while (low < high) {
        const middle = (low + high) >>> 1;
        const base = middle * fenceWords;
        // Equal keys pass unless `after`.
        let passes = after === 0;
        for (let k = 0; k < count; k++) {
            const a = fences[base + k];
            const b = probe[k];
            if (a !== b) {
                passes = a > b;
                break;
            }
        }
        if (passes) high = middle;
        else low = middle + 1;
    }
    found.k = low;
    if (low === table.blocks) {
        found.offset = 0;
        return;
    }
    const base = blockBase(table, order[low]);
    let first = 0;
    let last = lengths[order[low]];
    while (first < last) {
        const middle = (first + last) >>> 1;
        const at = base + middle * stride;
        let passes = after === 0;
        for (let k = 0; k < count; k++) {
            const a = entries[at + k];
            const b = probe[k];
            if (a !== b) {
                passes = a > b;
                break;
            }
        }
        if (passes) last = middle;
        else first = middle + 1;
    }
    found.offset = first;
};

/** The position of `found`'s block and offset. */
export const positionOf = (table: SortedTable, found: { readonly k: number; readonly offset: number }): number => found.k >= table.blocks ? table.size : firstPosition(table, found.k) + found.offset;

// Changing entries.

/** Where entity index `entity` is in its block, by scanning it, or -1. */
const offsetIn = (table: SortedTable, block: number, entity: number): number => {
    const { entries, stride, words } = table;
    const base = blockBase(table, block) + words;
    for (let k = 0, length = table.lengths[block]; k < length; k++) if (entries[base + k * stride] === entity) return k;
    return -1;
};

/** The words of the entry at `base`'s key equal `key`'s from `at`. */
export const sameStoredKey = (table: SortedTable, base: number, key: Uint32Array, at: number): boolean => {
    for (let k = 0; k < table.words; k++) if (table.entries[base + k] !== key[at + k]) return false;
    return true;
};

/** The block entity index `entity` is in, the offset of its entry there, or -1 for none. */
export const entryOf = (table: SortedTable, entity: number): number => {
    const block = table.blockOf[entity];
    if (block < 0) return -1;
    const offset = offsetIn(table, block, entity);
    return offset < 0 ? -1 : blockBase(table, block) + offset * table.stride;
};

/** Removes entity index `entity`'s entry, stamping its block; a block left empty is dropped, its neighbors stamped. */
export const removeSorted = (table: SortedTable, entity: number, tick: number): void => {
    const block = table.blockOf[entity];
    if (block < 0) return;
    const offset = offsetIn(table, block, entity);
    if (offset < 0) return;
    const { entries, stride } = table;
    const base = blockBase(table, block);
    const length = table.lengths[block];
    for (let k = (offset + 1) * stride, end = length * stride; k < end; k++) entries[base + k - stride] = entries[base + k];
    table.lengths[block] = length - 1;
    table.blockOf[entity] = -1;
    table.size--;
    const k = table.positions[block];
    if (length - 1 > 0) {
        addCount(table, k, -1);
        if (offset === length - 1) fence(table, k);
        stamp(table, k, tick);
        return;
    }
    // An empty block is dropped; its neighbors are stamped, so a range that held only its entries reads as changed.
    table.order.copyWithin(k, k + 1, table.blocks);
    table.blocks--;
    table.freed.push(block);
    reindex(table);
    if (k > 0) stamp(table, k - 1, tick);
    if (k < table.blocks) stamp(table, k, tick);
    if (table.blocks === 0) table.cleared = tick;
};

/**
 * Inserts an entry for entity index `entity`, its key's words in `key` from `at`, by its key then entity index,
 * stamping its block; a full block splits in two.
 */
export const insertSorted = (table: SortedTable, key: Uint32Array, at: number, values: readonly unknown[], entity: number, archetype: number, row: number, tick: number): void => {
    const { stride, words } = table;
    const probe = at === 0 ? key : key.subarray(at, at + words);
    if (table.blocks === 0) {
        const block = allocateBlock(table, tick);
        table.order[0] = block;
        table.blocks = 1;
        reindex(table);
    }
    // The block whose last entry is after the new one, or the last block.
    let low = 0;
    let high = table.blocks;
    const fenceWords = words + 1;
    while (low < high) {
        const middle = (low + high) >>> 1;
        if (compareEntry(table, table.fences, middle * fenceWords, probe, values, entity) > 0) high = middle;
        else low = middle + 1;
    }
    let k = Math.min(low, table.blocks - 1);
    let block = table.order[k];
    if (table.lengths[block] === blockEntries) {
        split(table, k, tick);
        // The new one goes in the first half unless it's after the first half's last entry.
        if (compareEntry(table, table.fences, k * fenceWords, probe, values, entity) < 0) k++;
        block = table.order[k];
    }
    const base = blockBase(table, block);
    const length = table.lengths[block];
    let first = 0;
    let last = length;
    while (first < last) {
        const middle = (first + last) >>> 1;
        if (compareEntry(table, table.entries, base + middle * stride, probe, values, entity) > 0) last = middle;
        else first = middle + 1;
    }
    const { entries } = table;
    for (let w = length * stride - 1; w >= first * stride; w--) entries[base + w + stride] = entries[base + w];
    const to = base + first * stride;
    for (let w = 0; w < words; w++) entries[to + w] = probe[w];
    entries[to + words] = entity;
    entries[to + words + 1] = archetype;
    entries[to + words + 2] = row;
    table.lengths[block] = length + 1;
    table.blockOf[entity] = block;
    table.size++;
    addCount(table, k, 1);
    if (first === length) fence(table, k);
    stamp(table, k, tick);
};

/** Splits the full block at position `k` into two halves, the second a new block after it. */
const split = (table: SortedTable, k: number, tick: number): void => {
    const block = table.order[k];
    const next = allocateBlock(table, tick);
    const { entries, stride, words } = table;
    const half = blockEntries >> 1;
    const from = blockBase(table, block) + half * stride;
    const to = blockBase(table, next);
    entries.copyWithin(to, from, from + (blockEntries - half) * stride);
    table.lengths[block] = half;
    table.lengths[next] = blockEntries - half;
    for (let e = 0; e < blockEntries - half; e++) table.blockOf[entries[to + e * stride + words]] = next;
    table.ticks[next] = table.ticks[block];
    for (const { ticks } of table.watched.values()) ticks[next] = ticks[block];
    if (table.order.length < table.blocks + 1) coverBlocks(table, table.blocks + 1);
    table.order.copyWithin(k + 2, k + 1, table.blocks);
    table.order[k + 1] = next;
    table.blocks++;
    reindex(table);
};

/** Updates where entity index `entity` is: its archetype and row, at its entry. */
export const relocateSorted = (table: SortedTable, entity: number, archetype: number, row: number): void => {
    const base = entryOf(table, entity);
    if (base < 0) return;
    table.entries[base + table.words + 1] = archetype;
    table.entries[base + table.words + 2] = row;
};

/**
 * Builds the table again from `count` entries in key order, then entity order: their keys' words, `words` each in
 * `keys`, and entity indexes, archetypes and rows, 3 each in `listed`, by `sorted[k]`, the entry at position `k`.
 * Every block's tick, and every watched tick, is `tick`.
 */
export const loadSortedTable = (table: SortedTable, count: number, keys: Uint32Array, listed: Int32Array, sorted: Int32Array, tick: number, entityCount: number): void => {
    const { words, stride } = table;
    coverSortedEntities(table, entityCount);
    table.blockOf.fill(-1);
    const blocks = Math.ceil(count / builtEntries);
    table.freed.length = 0;
    table.allocated = 0;
    coverBlocks(table, blocks);
    table.allocated = blocks;
    table.blocks = blocks;
    table.size = count;
    const { entries } = table;
    for (let b = 0; b < blocks; b++) {
        table.order[b] = b;
        const first = b * builtEntries;
        const length = Math.min(builtEntries, count - first);
        table.lengths[b] = length;
        table.ticks[b] = tick;
        for (const watch of table.watched.values()) watch.ticks[b] = tick;
        const base = blockBase(table, b);
        for (let e = 0; e < length; e++) {
            const entry = sorted[first + e];
            const to = base + e * stride;
            for (let w = 0; w < words; w++) entries[to + w] = keys[entry * words + w];
            const entity = listed[3 * entry];
            entries[to + words] = entity;
            entries[to + words + 1] = listed[3 * entry + 1];
            entries[to + words + 2] = listed[3 * entry + 2];
            table.blockOf[entity] = b;
        }
    }
    table.cleared = tick;
    reindex(table);
};

/** Starts keeping, by block, the newest tick a watched component may have changed in a row there, at `tick`. */
export const watchSortedComponent = (table: SortedTable, component: number, tick: number): void => {
    if (table.watched.has(component)) return;
    const ticks = allocateArray(table.memory, Float64Array, table.lengths.length).fill(tick);
    const tree = allocateArray(table.memory, Float64Array, 2 * table.leaves);
    const watch = { ticks, tree };
    table.watched.set(component, watch);
    buildTree(table, tree, ticks);
};

export const unwatchSortedComponent = (table: SortedTable, component: number): void => {
    const watch = table.watched.get(component);
    if (watch === undefined) return;
    freeArray(table.memory, watch.ticks);
    freeArray(table.memory, watch.tree);
    table.watched.delete(component);
};
