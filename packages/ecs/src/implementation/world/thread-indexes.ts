// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Layout } from '../../interface/registry/layout.js';
import { recordKey, type HashView } from './index-hash.js';
import { keyPartsOf } from './index-keys.js';
import { lookupFunction, type IndexView, type LookupArchetype, type Since } from './index-lookups.js';
import { sortedStride, type SortedView } from './index-sorted.js';
import type { RowHost } from './rows.js';
import type { Key } from './state.js';

/** How many f64 words a lookup's index record takes, as `writeIndexParameters` (`kernel-indexes.ts`) writes it. */
export const recordWordsOf = (sorted: boolean, watched: number): number => (sorted ? 11 : 7) + watched;

/**
 * A joined thread's lookup through one of the world's indexes, which lives in the memory: the function its body calls,
 * and `refresh`, which points its views at the index's arrays as the world wrote them into its record before the task.
 */
export type ThreadIndex = { readonly lookup: (...key: unknown[]) => unknown; readonly refresh: (buffer: ArrayBufferLike) => void };

/** What a joined thread knows of a lookup through an index: its key's layouts, the index's kind, its rows' reads and its record. */
export type ThreadIndexSetup = {
    readonly layouts: readonly Layout[];
    readonly sorted: boolean;
    readonly unique: boolean;
    readonly reads: readonly Key[];
    readonly readIds: readonly number[];
    readonly watched: number;
    /** The byte offset of the record the world writes before each task. */
    readonly record: number;
};

const none32 = new Uint32Array(0);
const noneI32 = new Int32Array(0);
const none64 = new Float64Array(0);

/** A view from `at` to the end of the memory, the same one while neither changed. */
const spanning = <A extends Uint32Array | Int32Array | Float64Array>(current: A, buffer: ArrayBufferLike, at: number, make: (buffer: ArrayBufferLike, at: number) => A): A =>
    current.buffer === buffer && current.byteOffset === at ? current : make(buffer, at);
const u32From = (buffer: ArrayBufferLike, at: number): Uint32Array => new Uint32Array(buffer, at);
const i32From = (buffer: ArrayBufferLike, at: number): Int32Array => new Int32Array(buffer, at);
const f64From = (buffer: ArrayBufferLike, at: number): Float64Array => new Float64Array(buffer, at);

export const createThreadIndex = (rows: RowHost, archetypeAt: (id: number) => LookupArchetype | undefined, setup: ThreadIndexSetup): ThreadIndex => {
    const { parts, words } = keyPartsOf(setup.layouts);
    const watchedPositions = Array.from({ length: setup.watched }, (_, k) => k);
    const hashWatched = new Map<number, Float64Array>();
    const sortedWatched = new Map<number, { tree: Float64Array }>();
    const hash: HashView | null = setup.sorted ? null : { words, stride: recordKey + words, slots: none32, records: none32, ticks: none64, cleared: 0, entries: noneI32, watched: hashWatched };
    const sorted: SortedView | null = !setup.sorted ? null : {
        words, stride: sortedStride(words), parts, objects: false, entries: none32, lengths: noneI32, order: noneI32, blocks: 0, counts: noneI32, tree: none64, leaves: 1,
        fences: none32, size: 0, cleared: 0, watched: sortedWatched,
    };
    const index: IndexView = { parts, words, unique: setup.unique, hash, sorted };
    const since: Since = { value: 0 };
    const lookup = lookupFunction({ rows, archetypeAt, index, unique: setup.unique, reads: setup.reads, readIds: setup.readIds, watched: watchedPositions, since, replaced: null });
    const count = recordWordsOf(setup.sorted, setup.watched);
    let record: Float64Array = none64;
    const refresh = (buffer: ArrayBufferLike): void => {
        if (record.buffer !== buffer) record = new Float64Array(buffer, setup.record, count);
        if (hash !== null) {
            const slots = record[0];
            const length = (record[1] + 1) * 2;
            if (hash.slots.buffer !== buffer || hash.slots.byteOffset !== slots || hash.slots.length !== length) hash.slots = new Uint32Array(buffer, slots, length);
            hash.records = spanning(hash.records, buffer, record[2], u32From);
            hash.entries = spanning(hash.entries, buffer, record[3], i32From);
            hash.ticks = spanning(hash.ticks, buffer, record[4], f64From);
            hash.cleared = record[5];
            since.value = record[6];
            for (let k = 0; k < setup.watched; k++) hashWatched.set(k, spanning(hashWatched.get(k) ?? none64, buffer, record[7 + k], f64From));
            return;
        }
        if (sorted === null) return;
        sorted.fences = spanning(sorted.fences, buffer, record[0], u32From);
        sorted.blocks = record[1];
        sorted.order = spanning(sorted.order, buffer, record[2], i32From);
        sorted.lengths = spanning(sorted.lengths, buffer, record[3], i32From);
        sorted.entries = spanning(sorted.entries, buffer, record[4], u32From);
        sorted.counts = spanning(sorted.counts, buffer, record[5], i32From);
        sorted.size = record[6];
        sorted.tree = spanning(sorted.tree, buffer, record[7], f64From);
        sorted.leaves = record[8];
        sorted.cleared = record[9];
        since.value = record[10];
        for (let k = 0; k < setup.watched; k++) {
            const watch = sortedWatched.get(k);
            const at = record[11 + k];
            if (watch === undefined) sortedWatched.set(k, { tree: f64From(buffer, at) });
            else watch.tree = spanning(watch.tree, buffer, at, f64From);
        }
    };
    return { lookup, refresh };
};
