import type { TypedArray, View } from '../../interface/registry/layout.js';
import { encodeScalar } from './index-keys.js';
import type { WasmKeyValue, WasmProbe } from './wasm.js';

/** Entries a sorted index's block holds at most (`index-sorted.ts`). */
const blockEntries = 128;

/**
 * Where a lookup through an index finds its index's arrays: each an array and the element its first is at, so the
 * world's thread reads the index's own arrays and other threads a view of the whole memory; and its counts and ticks.
 * The fields follow the parameters WASM kernels take (`wasm.ts`, `indexParameterCount`).
 */
export type IndexSource = {
    kind: "hash" | "sorted";
    /** A hash index's slots, two words each, and their mask; its buckets' records; its entries; its buckets' ticks. */
    slots: Uint32Array; slotsBase: number; mask: number;
    records: Uint32Array; recordsBase: number;
    hashEntries: Int32Array; hashEntriesBase: number;
    ticks: Float64Array; ticksBase: number;
    /** A sorted index's fences, blocks in order, lengths, entries, Fenwick tree, entry count, tick tree and its leaves. */
    fences: Uint32Array; fencesBase: number; blocks: number;
    order: Int32Array; orderBase: number;
    lengths: Int32Array; lengthsBase: number;
    sortedEntries: Uint32Array; sortedEntriesBase: number;
    counts: Int32Array; countsBase: number; size: number;
    tree: Float64Array; treeBase: number; leaves: number;
    /** When a bucket or the last entry was dropped, the system's `lastRun`, and each watched component's ticks or tree. */
    cleared: number;
    since: number;
    watched: Float64Array[]; watchedBases: number[];
};

const none = new Uint32Array(0);

export const createIndexSource = (kind: "hash" | "sorted"): IndexSource => ({
    kind,
    slots: none, slotsBase: 0, mask: 0, records: none, recordsBase: 0, hashEntries: new Int32Array(0), hashEntriesBase: 0, ticks: new Float64Array(0), ticksBase: 0,
    fences: none, fencesBase: 0, blocks: 0, order: new Int32Array(0), orderBase: 0, lengths: new Int32Array(0), lengthsBase: 0,
    sortedEntries: none, sortedEntriesBase: 0, counts: new Int32Array(0), countsBase: 0, size: 0, tree: new Float64Array(0), treeBase: 0, leaves: 0,
    cleared: 0, since: -1, watched: [], watchedBases: [],
});

/**
 * Points a source at an index through the whole memory's views, from its parameters as a WASM kernel takes them:
 * addresses in bytes, counts and ticks.
 */
export const sourceFromParameters = (source: IndexSource, memory: { readonly u32: Uint32Array; readonly i32: Int32Array; readonly f64: Float64Array }, parameters: readonly number[], at: number, watched: number): void => {
    const { u32, i32, f64 } = memory;
    if (source.kind === "hash") {
        source.slots = u32; source.slotsBase = parameters[at] >>> 2; source.mask = parameters[at + 1];
        source.records = u32; source.recordsBase = parameters[at + 2] >>> 2;
        source.hashEntries = i32; source.hashEntriesBase = parameters[at + 3] >>> 2;
        source.ticks = f64; source.ticksBase = parameters[at + 4] >>> 3;
        source.cleared = parameters[at + 5]; source.since = parameters[at + 6];
        source.watched.length = source.watchedBases.length = 0;
        for (let k = 0; k < watched; k++) { source.watched.push(f64); source.watchedBases.push(parameters[at + 7 + k] >>> 3); }
        return;
    }
    source.fences = u32; source.fencesBase = parameters[at] >>> 2; source.blocks = parameters[at + 1];
    source.order = i32; source.orderBase = parameters[at + 2] >>> 2;
    source.lengths = i32; source.lengthsBase = parameters[at + 3] >>> 2;
    source.sortedEntries = u32; source.sortedEntriesBase = parameters[at + 4] >>> 2;
    source.counts = i32; source.countsBase = parameters[at + 5] >>> 2; source.size = parameters[at + 6];
    source.tree = f64; source.treeBase = parameters[at + 7] >>> 3; source.leaves = parameters[at + 8];
    source.cleared = parameters[at + 9]; source.since = parameters[at + 10];
    source.watched.length = source.watchedBases.length = 0;
    for (let k = 0; k < watched; k++) { source.watched.push(f64); source.watchedBases.push(parameters[at + 11 + k] >>> 3); }
};

/** A leaf bodies read of a lookup's rows: its component, the view it's stored through, its stride and offset in elements. */
export type RowLeaf = { readonly component: number; readonly view: View; readonly unitStride: number; readonly unitOffset: number; readonly boolean: boolean };

/** What a JS kernel's lookup through an index needs besides its source: its key's words, entry stride, probes and row leaves. */
export type IndexReaderSetup = {
    readonly kind: "hash" | "sorted";
    readonly words: number;
    readonly stride: number;
    /** By probe of the kernel, its plan, or null for a probe of another lookup. */
    readonly probes: readonly (WasmProbe | null)[];
    readonly rowLeaves: readonly (RowLeaf | null)[];
};

/** An archetype as a reader reads its rows: its version, its entities, and a column's view, by component and view. */
export type ReaderArchetype = { readonly version: number; readonly entities: Float64Array; readonly column: (component: number, view: View) => TypedArray | undefined };

/**
 * A handle a kernel's site holds, which its reader fills (`compile-kernel.ts`): a list's bucket, start and length, or
 * runs and cursor; a row's archetype, row and whether it was found (`f`).
 */
type Handle = { a: number; b: number; c: number; d: number; e: number; f: number; g: number; h: number };

/** A lookup through an index as a JS kernel reads it: probes, lists' lengths, `changed` and rows, rows' leaves and entities. */
export type IndexReader = {
    readonly source: IndexSource;
    readonly probe: (probe: number, list: Handle, first: Handle, a0?: number, a1?: number, a2?: number, a3?: number, a4?: number, a5?: number, a6?: number, a7?: number,
        a8?: number, a9?: number, a10?: number, a11?: number, a12?: number, a13?: number, a14?: number, a15?: number) => void;
    readonly length: (list: Handle) => number;
    readonly changed: (list: Handle) => boolean;
    readonly row: (row: Handle, list: Handle, index: number) => void;
    readonly leaf: (row: Handle, leaf: number) => number | boolean;
    readonly entity: (row: Handle) => number;
};

/** A reader over `source`, reading rows through `archetypeAt`. */
export const createIndexReader = (setup: IndexReaderSetup, source: IndexSource, archetypeAt: (id: number) => ReaderArchetype | undefined): IndexReader => {
    const { words, stride } = setup;
    const key = new Uint32Array(Math.max(1, words));
    /** By archetype id: the version its views were found at, and each row leaf's view there. */
    const views: (TypedArray | undefined)[][] = [];
    const versions: number[] = [];
    const leafView = (archetype: number, leaf: number): TypedArray | undefined => {
        const found = archetypeAt(archetype);
        if (found === undefined) return undefined;
        if (versions[archetype] !== found.version) {
            versions[archetype] = found.version;
            views[archetype] = setup.rowLeaves.map(row => row === null ? undefined : found.column(row.component, row.view));
        }
        return views[archetype]?.[leaf];
    };
    const encode = (values: readonly number[], targets: readonly WasmKeyValue[], at: number): number => {
        let next = at;
        for (const target of targets) encodeScalar(target.scalar, values[next++], key, target.word);
        return next;
    };
    /** The first position whose key's first `count` words are after the key's, or not before them (`bound` in `index-sorted.ts`). */
    const bound = (count: number, after: boolean): number => {
        if (count === 0) return after ? source.size : 0;
        const { fences, fencesBase, order, orderBase, lengths, lengthsBase, sortedEntries, sortedEntriesBase } = source;
        const passes = (array: Uint32Array, base: number): boolean => {
            for (let k = 0; k < count; k++) {
                const a = array[base + k];
                const b = key[k];
                if (a !== b) return a > b;
            }
            return !after;
        };
        let low = 0;
        let high = source.blocks;
        while (low < high) {
            const middle = (low + high) >>> 1;
            if (passes(fences, fencesBase + middle * (words + 1))) high = middle;
            else low = middle + 1;
        }
        if (low >= source.blocks) return source.size;
        const k = low;
        const block = order[orderBase + k];
        const base = sortedEntriesBase + block * blockEntries * stride;
        let first = 0;
        let last = lengths[lengthsBase + block];
        while (first < last) {
            const middle = (first + last) >>> 1;
            if (passes(sortedEntries, base + middle * stride)) last = middle;
            else first = middle + 1;
        }
        return prefix(k) + first;
    };
    const prefix = (k: number): number => {
        const { counts, countsBase } = source;
        let sum = 0;
        for (let node = k; node > 0; node -= node & -node) sum += counts[countsBase + node];
        return sum;
    };
    const blockAt = (position: number): number => {
        const { counts, countsBase, blocks } = source;
        let k = 0;
        let remaining = position;
        let step = 1;
        while (step * 2 <= blocks) step *= 2;
        for (; step > 0 && blocks > 0; step >>= 1) {
            const next = k + step;
            if (next <= blocks && counts[countsBase + next] <= remaining) {
                k = next;
                remaining -= counts[countsBase + next];
            }
        }
        return k;
    };
    const treeNewer = (tree: Float64Array, base: number, low: number, high: number): boolean => {
        // The whole index: the tree's root.
        if (low <= 0 && high >= source.size) return tree[base + 1] > source.since;
        const last = source.size - 1;
        const from = blockAt(Math.min(last, Math.max(low - 1, 0)));
        const to = blockAt(Math.min(last, high));
        let maximum = 0;
        for (let node = from + source.leaves, limit = to + source.leaves + 1; node < limit; node >>= 1, limit >>= 1) {
            if ((node & 1) === 1) maximum = Math.max(maximum, tree[base + node++]);
            if ((limit & 1) === 1) maximum = Math.max(maximum, tree[base + --limit]);
        }
        return maximum > source.since;
    };
    const runChanged = (low: number, high: number): boolean => {
        if (treeNewer(source.tree, source.treeBase, low, high)) return true;
        for (let k = 0; k < source.watched.length; k++) if (treeNewer(source.watched[k], source.watchedBases[k], low, high)) return true;
        return false;
    };
    const length = (list: Handle): number => source.kind === "hash" ? list.c : list.b - list.a + list.d - list.c;
    const row = (target: Handle, list: Handle, index: number): void => {
        target.f = 0;
        if (!(index >= 0 && index < length(list))) return;
        let position = Math.floor(index);
        let archetype: number;
        let found: number;
        if (source.kind === "hash") {
            const at = source.hashEntriesBase + (list.b + position) * 3;
            archetype = source.hashEntries[at + 1];
            found = source.hashEntries[at + 2];
        }
        else {
            const first = list.b - list.a;
            position = position < first ? list.a + position : list.c + position - first;
            // The cursor: block position `e`, its first entry's position `g`, its length `h`.
            if (!(position >= list.g && position < list.g + list.h)) {
                list.e = blockAt(position);
                list.g = prefix(list.e);
                list.h = source.lengths[source.lengthsBase + source.order[source.orderBase + list.e]];
            }
            const block = source.order[source.orderBase + list.e];
            const at = source.sortedEntriesBase + block * blockEntries * stride + (position - list.g) * stride;
            archetype = source.sortedEntries[at + words + 1];
            found = source.sortedEntries[at + words + 2];
        }
        target.a = archetype;
        target.b = found;
        target.f = 1;
    };
    /** A probe's values, copied from its arguments, reused. */
    const values: number[] = [];
    return {
        source,
        probe: (probe, list, first, a0 = NaN, a1 = NaN, a2 = NaN, a3 = NaN, a4 = NaN, a5 = NaN, a6 = NaN, a7 = NaN, a8 = NaN, a9 = NaN, a10 = NaN, a11 = NaN, a12 = NaN, a13 = NaN, a14 = NaN, a15 = NaN) => {
            const plan = setup.probes[probe];
            if (plan === null || plan === undefined) return;
            values[0] = a0; values[1] = a1; values[2] = a2; values[3] = a3; values[4] = a4; values[5] = a5; values[6] = a6; values[7] = a7;
            values[8] = a8; values[9] = a9; values[10] = a10; values[11] = a11; values[12] = a12; values[13] = a13; values[14] = a14; values[15] = a15;
            let next = encode(values, plan.values, 0);
            if (source.kind === "hash") {
                let hash = 0x811C9DC5;
                for (let k = 0; k < words; k++) {
                    hash = Math.imul(hash ^ key[k], 0x9E3779B1);
                    hash ^= hash >>> 15;
                }
                hash = Math.imul(hash ^ (hash >>> 16), 0x85EBCA6B);
                hash = Math.imul(hash ^ (hash >>> 13), 0xC2B2AE35);
                hash = (hash ^ (hash >>> 16)) >>> 0;
                const { slots, slotsBase, mask, records, recordsBase } = source;
                const recordWords = stride;
                let bucket = -1;
                for (let slot = hash & mask; ; slot = (slot + 1) & mask) {
                    const filled = slots[slotsBase + 2 * slot + 1];
                    if (filled === 0) break;
                    if (slots[slotsBase + 2 * slot] !== hash) continue;
                    const base = recordsBase + (filled - 1) * recordWords + 4;
                    let same = true;
                    for (let k = 0; k < words && same; k++) same = records[base + k] === key[k];
                    if (same) {
                        bucket = filled - 1;
                        break;
                    }
                }
                list.a = bucket;
                list.b = bucket < 0 ? 0 : records[recordsBase + bucket * recordWords + 1];
                list.c = bucket < 0 ? 0 : records[recordsBase + bucket * recordWords + 2];
            }
            else {
                list.c = list.d = 0;
                list.h = 0;
                let low = bound(plan.prefixWords, false);
                let high = bound(plan.prefixWords, true);
                if (plan.comparisons !== null) {
                    let unequalLow = -1;
                    let unequalHigh = -1;
                    for (const comparison of plan.comparisons) {
                        next = encode(values, comparison.values, next);
                        switch (comparison.operator) {
                            case ">=": low = Math.max(low, bound(comparison.words, false)); break;
                            case ">": low = Math.max(low, bound(comparison.words, true)); break;
                            case "<": high = Math.min(high, bound(comparison.words, false)); break;
                            case "<=": high = Math.min(high, bound(comparison.words, true)); break;
                            case "==": low = Math.max(low, bound(comparison.words, false)); high = Math.min(high, bound(comparison.words, true)); break;
                            case "!=": unequalLow = bound(comparison.words, false); unequalHigh = bound(comparison.words, true); break;
                            default: break;
                        }
                    }
                    if (high < low) high = low;
                    if (unequalLow >= 0) {
                        list.c = Math.max(low, Math.min(high, unequalHigh));
                        list.d = high;
                        high = Math.min(high, Math.max(low, unequalLow));
                        if (list.c >= list.d) list.c = list.d = 0;
                    }
                }
                list.a = low;
                list.b = high;
            }
            row(first, list, 0);
        },
        length,
        changed: list => {
            const { since } = source;
            if (source.kind === "hash") {
                const bucket = list.a;
                if (bucket < 0) return source.cleared > since;
                if (source.ticks[source.ticksBase + bucket] > since) return true;
                for (let k = 0; k < source.watched.length; k++) if (source.watched[k][source.watchedBases[k] + bucket] > since) return true;
                return false;
            }
            if (source.blocks === 0) return source.cleared > since;
            return runChanged(list.a, list.b) || (list.d > list.c && runChanged(list.c, list.d));
        },
        row,
        leaf: (target, leaf) => {
            if (target.f !== 1) return NaN;
            const view = leafView(target.a, leaf);
            const found = setup.rowLeaves[leaf];
            if (view === undefined || found === null || found === undefined) return NaN;
            const value = view[target.b * found.unitStride + found.unitOffset];
            return found.boolean ? value !== 0 : value;
        },
        entity: target => {
            if (target.f !== 1) return NaN;
            return archetypeAt(target.a)?.entities[target.b] ?? NaN;
        },
    };
};
