// © 2026 Adobe. MIT License. See /LICENSE for details.
import { allocateArray } from './arrays.js';
import type { Memory } from './memory.js';

// The arrivals ring: rows moving between archetypes, a pair of archetypes per block of rows a sync point moves, for
// systems with `where` and change filters, which keep a point per archetype. A row moved from an archetype the system
// skipped holds changes it never saw, so its new archetype owes them: its rows pass the system's change filters since
// the point of the archetype they came from, as of the move (`createDebts`). Written by the world's thread at sync
// points, while a system with points registered or a joined thread holds claims, and read by each such system as it
// runs, on the world's thread or a joined one, which finds it by the layout directory's header.

/** The layout directory's header word holding the offset of the ring's control block, 0 before one is written. */
export const arrivalsWord = 15;
/**
 * The control block's words: the entries written, modulo 2^32, stored after each; the capacity; the entries' offset;
 * and how many times archetypes were reclaimed or reused, modulo 2^32 (`reclaim.ts`), which a joined thread's systems
 * check to find their matches again.
 */
const positionWord = 0;
const capacityWord = 1;
const entriesOffsetWord = 2;
export const membershipWord = 3;
const controlWords = 16;
/** An entry: the archetype rows moved from, the one they moved to, and the sync's tick, low and high words. */
const entryWords = 4;
/** A power of two, its entries a block of 64 KiB. A system further behind owes, for every archetype, its oldest point. */
const capacity = 4096;

/** The world's side of the ring: its control block and its entries, each a block of the memory when it's shared. */
export type Arrivals = { readonly control: Uint32Array; readonly entries: Uint32Array };

/** The ring, allocated with the first arrival logged. */
export const createArrivals = (memory: Memory): Arrivals => {
    const entries = allocateArray(memory, Uint32Array, capacity * entryWords).fill(0);
    const control = allocateArray(memory, Uint32Array, controlWords).fill(0);
    control[capacityWord] = capacity;
    control[entriesOffsetWord] = entries.byteOffset;
    if (memory.shared) Atomics.store(memory.header, arrivalsWord, control.byteOffset);
    return { control, entries };
};

/** Logs rows moving from archetype `from` into `to` at a sync point of `tick`. */
export const logArrival = ({ control, entries }: Arrivals, from: number, to: number, tick: number): void => {
    const position = control[positionWord];
    const at = (position & (capacity - 1)) * entryWords;
    entries[at] = from;
    entries[at + 1] = to;
    entries[at + 2] = tick % 0x100000000;
    entries[at + 3] = Math.floor(tick / 0x100000000);
    Atomics.store(control, positionWord, (position + 1) >>> 0);
};

/** Where a reader finds the ring: its control block in `control` from word `controlAt`, its entries likewise. */
export type ArrivalsView = { readonly control: Uint32Array; readonly controlAt: number; readonly entries: Uint32Array; readonly entriesAt: number };

/** The world's thread's view of its ring. */
export const viewOfArrivals = ({ control, entries }: Arrivals): ArrivalsView => ({ control, controlAt: 0, entries, entriesAt: 0 });

/** A joined thread's view of the ring whose control block is at byte `offset` of the memory `words` cover. */
export const viewInMemory = (words: Uint32Array, offset: number): ArrivalsView => {
    const controlAt = offset >> 2;
    return { control: words, controlAt, entries: words, entriesAt: words[controlAt + entriesOffsetWord] >> 2 };
};

/** How many times archetypes were reclaimed or reused, modulo 2^32: 0 before the ring is written. */
export const membershipOf = (view: ArrivalsView | null): number => view === null ? 0 : Atomics.load(view.control, view.controlAt + membershipWord);

/** The entries written so far, modulo 2^32, as a reader's cursor starts. */
export const arrivalsPosition = (view: ArrivalsView | null): number => view === null ? 0 : Atomics.load(view.control, view.controlAt + positionWord);

/**
 * What archetypes owe a system with points: by archetype id, the oldest point rows moved into it since its own point
 * were last seen at, by the system's point of each archetype they came from, or its last run for a non-match's. A row
 * is counted changed in its new archetype only if it changed after that, so moves among archetypes the system saw cost
 * nothing, and a run reads its arrivals once, however many archetypes it goes over.
 */
export type Debts = {
    /** The point an archetype's rows pass change filters after: its own, or older for rows moved in from elsewhere. */
    readonly sinceOf: (id: number, point: number) => number;
    /**
     * Reads arrivals through tick `through`, of `archetypes` archetypes, its last run `latest`; once the ring overwrote
     * some unread, every archetype owes the oldest of `oldest()`, the system's oldest point, and what any owed.
     */
    readonly read: (view: ArrivalsView | null, through: number, archetypes: number, latest: number, oldest: () => number) => void;
    /** Clears what an archetype owed, as its system runs over it. */
    readonly settle: (id: number) => void;
    /** The oldest debt, for what any archetype's rows may pass since; Infinity for none. */
    readonly oldest: () => number;
};

/**
 * The debts of a system with points: `points` by match, and `matchOf` by archetype id, its match or -1, its runner's,
 * read as they are. Starts reading the ring at entry `start`.
 */
export const createDebts = (points: readonly number[], matchOf: readonly number[], start: number): Debts => {
    /** By archetype id, Infinity for none. */
    let owed = new Float64Array(64).fill(Infinity);
    const ensure = (archetypes: number): void => {
        if (archetypes <= owed.length) return;
        let length = owed.length * 2;
        while (length < archetypes) length *= 2;
        const grown = new Float64Array(length).fill(Infinity);
        grown.set(owed);
        owed = grown;
    };
    let cursor = start;
    /**
     * Once the ring overwrote unread entries, the oldest point as of then, which every archetype owes again at the next
     * read too: entries skipped may be of syncs after the run's, whose rows that run's archetypes didn't have yet.
     */
    let floor = Infinity;
    const oldestOwed = (): number => {
        let oldest = Infinity;
        for (let id = 0; id < owed.length; id++) if (owed[id] < oldest) oldest = owed[id];
        return oldest;
    };
    const owe = (archetypes: number, point: number): void => {
        for (let id = 0; id < archetypes; id++) if (point < owed[id]) owed[id] = point;
    };
    /** Reads entries from the cursor through `through`; false when the ring overwrote some unread, before or while. */
    const readThrough = (view: ArrivalsView, through: number, latest: number): boolean => {
        const { control, controlAt, entries, entriesAt } = view;
        const size = control[controlAt + capacityWord];
        const pending = (Atomics.load(control, controlAt + positionWord) - cursor) >>> 0;
        if (pending > size) return false;
        let read = 0;
        let debts = owed;
        const mask = size - 1;
        for (; read < pending; read++) {
            const at = entriesAt + ((cursor + read) & mask) * entryWords;
            if (entries[at + 2] + entries[at + 3] * 0x100000000 > through) break;
            const from = entries[at];
            const to = entries[at + 1];
            if (from >= debts.length || to >= debts.length) {
                ensure(Math.max(from, to) + 1);
                debts = owed;
            }
            const m = matchOf[from];
            let point = m >= 0 ? points[m] : latest;
            if (debts[from] < point) point = debts[from];
            if (point < debts[to]) debts[to] = point;
        }
        if (((Atomics.load(control, controlAt + positionWord) - cursor) >>> 0) > size) return false;
        cursor = (cursor + read) >>> 0;
        return true;
    };
    return {
        sinceOf: (id, point) => id < owed.length && owed[id] < point ? owed[id] : point,
        read: (view, through, archetypes, latest, oldest) => {
            if (view === null) return;
            ensure(archetypes);
            const skipped = floor;
            floor = Infinity;
            if (skipped !== Infinity) owe(archetypes, skipped);
            if (readThrough(view, through, latest)) return;
            cursor = arrivalsPosition(view);
            floor = Math.min(oldest(), oldestOwed(), skipped);
            owe(archetypes, floor);
        },
        settle: id => {
            if (id < owed.length) owed[id] = Infinity;
        },
        oldest: oldestOwed,
    };
};
