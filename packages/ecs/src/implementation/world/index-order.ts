import type { Archetype } from './archetype.js';
import { allocateArray, freeArray } from './arrays.js';
import { blockAt, blockBase, firstPosition, type SortedTable } from './index-sorted.js';
import type { Memory } from './memory.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import type { Run } from './up.js';

// A system's rows in a sorted index's order (`order`): runs of consecutive entries of one matched archetype, in key
// order and then entity order, each a list of rows, as `up`'s runs are.

/** Below this share of the index passing a run's change filters, passing rows are found by their ticks and sorted by position; above it the index is scanned. */
const sparseShare = 1 / 8;

type MutableRun = { owner: number; parent: number; rows: Int32Array; parents: Int32Array; start: number; end: number };

/** What a system's change filters pass of a matched archetype: its filters, and the tick rows pass after, -1 for every row. */
export type Passing = { readonly filters: (archetype: Archetype) => readonly Filter[]; readonly since: (archetype: Archetype) => number };

export type Ordered = {
    /**
     * The runs of the rows of `matches` the index holds, in its order, those that pass with `passing`, or all without.
     * Valid until the next call; their rows are in the arena, so WASM reads them.
     */
    readonly runs: (sorted: SortedTable, matches: readonly Archetype[], passing: Passing | null) => readonly Run[];
    /** By archetype id, its position among `matches`, or -1: kept until the matches grow. */
    readonly owners: (matches: readonly Archetype[]) => Int32Array;
    readonly release: () => void;
};

export const createOrdered = (memory: Memory): Ordered => {
    let rows = new Int32Array(0);
    /** By archetype id: its position in the matches, or -1. */
    let owners = new Int32Array(0);
    let matched: readonly Archetype[] = [];
    let ownersFor = 0;
    /** Positions in the index of the rows that pass, for sorting. */
    let positions = new Int32Array(0);
    /** Runs made so far, reused; and those of the last call. */
    const made: MutableRun[] = [];
    const runs: MutableRun[] = [];
    let count = 0;
    let written = 0;
    /** Per owner: its filters and since for this call. */
    const filters: (readonly Filter[])[] = [];
    const sinces: number[] = [];

    const ownersOf = (matches: readonly Archetype[]): Int32Array => {
        if (matched === matches && ownersFor === matches.length) return owners;
        let length = 0;
        for (const archetype of matches) length = Math.max(length, archetype.id + 1);
        if (owners.length < length) owners = new Int32Array(Math.max(length, 2 * owners.length));
        owners.fill(-1);
        matches.forEach((archetype, owner) => { owners[archetype.id] = owner; });
        matched = matches;
        ownersFor = matches.length;
        return owners;
    };

    const fitRows = (length: number): void => {
        if (rows.length >= length) return;
        if (rows.length > 0) freeArray(memory, rows);
        rows = allocateArray(memory, Int32Array, Math.max(length, 2 * rows.length, 64));
    };

    /** Appends a row of `owner`, starting a run when the previous row's owner differs. */
    const append = (owner: number, row: number): void => {
        if (count === 0 || made[count - 1].owner !== owner) {
            const run = made[count] ??= { owner, parent: -1, rows, parents: rows, start: 0, end: 0 };
            run.owner = owner;
            run.rows = run.parents = rows;
            run.start = run.end = written;
            count++;
        }
        rows[written++] = row;
        made[count - 1].end = written;
    };

    /** Whether a row of `owner` passes its archetype's filters. */
    const passes = (owner: number, row: number): boolean => {
        const since = sinces[owner];
        if (since < 0) return true;
        const found = filters[owner];
        if (found.length === 0) return true;
        for (let k = 0; k < found.length; k++) if (found[k].ticks[row] > since) return true;
        return false;
    };

    /** Every entry of the index, in order, whose archetype is matched and, when `filtered`, whose row passes. */
    const scan = (sorted: SortedTable, slots: Int32Array, filtered: boolean): void => {
        const { order, lengths, entries, stride, words, blocks } = sorted;
        for (let k = 0; k < blocks; k++) {
            const block = order[k];
            const base = blockBase(sorted, block);
            for (let j = 0, length = lengths[block]; j < length; j++) {
                const at = base + j * stride + words;
                const archetype = entries[at + 1];
                const owner = archetype < slots.length ? slots[archetype] : -1;
                if (owner < 0) continue;
                const row = entries[at + 2];
                if (filtered && !passes(owner, row)) continue;
                append(owner, row);
            }
        }
    };

    /** The rows that pass, found by their ticks, sorted by their positions in the index; false when more pass than a scan costs. */
    const gather = (sorted: SortedTable, matches: readonly Archetype[], slots: Int32Array): boolean => {
        const most = Math.max(64, sorted.size * sparseShare);
        let passed = 0;
        if (positions.length < most) positions = new Int32Array(Math.ceil(most));
        let fits = true;
        const { blockOf, positions: placed, entries, stride, words, lengths } = sorted;
        matches.forEach((archetype, owner) => {
            if (!fits || archetype.count === 0) return;
            forEachPassingRange(filters[owner], sinces[owner], 0, archetype.count, (start, end) => {
                for (let row = start; row < end && fits; row++) {
                    const entity = archetype.entities[row] >>> 0;
                    const block = entity < blockOf.length ? blockOf[entity] : -1;
                    if (block < 0) continue;
                    if (passed >= most) {
                        fits = false;
                        return;
                    }
                    // Its offset in its block, by its entity index.
                    const base = blockBase(sorted, block);
                    let offset = 0;
                    while (offset < lengths[block] && entries[base + offset * stride + words] !== entity) offset++;
                    positions[passed++] = firstPosition(sorted, placed[block]) + offset;
                }
            });
        });
        if (!fits) return false;
        const sortedPositions = positions.subarray(0, passed).sort();
        let k = -1;
        let first = 0;
        let length = 0;
        let base = 0;
        for (let n = 0; n < passed; n++) {
            const position = sortedPositions[n];
            if (k < 0 || position >= first + length) {
                k = blockAt(sorted, position);
                first = firstPosition(sorted, k);
                length = lengths[sorted.order[k]];
                base = blockBase(sorted, sorted.order[k]);
            }
            const at = base + (position - first) * stride + words;
            const owner = slots[entries[at + 1]];
            if (owner >= 0) append(owner, entries[at + 2]);
        }
        return true;
    };

    return {
        runs: (sorted, matches, passing) => {
            count = 0;
            written = 0;
            const slots = ownersOf(matches);
            fitRows(sorted.size);
            let filtered = false;
            if (passing !== null) {
                for (let owner = 0; owner < matches.length; owner++) {
                    filters[owner] = passing.filters(matches[owner]);
                    sinces[owner] = passing.since(matches[owner]);
                    if (sinces[owner] >= 0 && filters[owner].length > 0) filtered = true;
                }
            }
            if (!filtered || !gather(sorted, matches, slots)) {
                count = 0;
                written = 0;
                scan(sorted, slots, filtered);
            }
            for (let k = 0; k < count; k++) runs[k] = made[k];
            runs.length = count;
            return runs;
        },
        owners: ownersOf,
        release: () => {
            if (rows.length > 0) freeArray(memory, rows);
            rows = new Int32Array(0);
        },
    };
};
