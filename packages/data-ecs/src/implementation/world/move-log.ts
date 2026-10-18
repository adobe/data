import type { Archetype } from './archetype.js';
import type { Memory } from './memory.js';

// The move log: how a joined thread's object columns follow the world's rows. For archetypes holding objects a joined
// thread fills, every path that moves or fills a row appends, in apply order, entries the thread replays on its own
// columns. Shared by the world's thread, which writes it, and the joined thread, which reads it (`mirror.ts`).

/**
 * The log's header, a block of its own that never moves: the ring's version, bumped when it's replaced, its offset
 * and capacity in entries, a power of two; the position the writer may have written up to; the position published
 * through, and the sync published through, modulo 2^32; then the sync observers were delivered through; then the
 * thread's first stop list and the sync it finalized through. Positions count entries from the start, modulo 2^32.
 */
export const logVersionWord = 0;
export const logOffsetWord = 1;
export const logCapacityWord = 2;
export const logLimitWord = 3;
export const logPublishedWord = 4;
export const logSyncWord = 5;
/** The sync observers were last delivered through, so a thread reads its objects only as of the values delivered. */
export const logDeliveredWord = 6;
/** The offset of the thread's first stop list (`stop-lists.ts`), 0 before one is written. */
export const logStopsWord = 7;
/** The sync the thread finalized through, which it stores once its finalizers ran for every stop through it. */
export const logFinalizedWord = 8;
/**
 * While a tail is in flight on the thread, 1, and the sync it names, which the thread's replay stops at so the tail's
 * rows stay those of that sync; the world stores them as it posts the tail and clears the flag once it's done.
 */
export const logBoundedWord = 9;
export const logBoundWord = 10;
export const logHeaderBytes = 64;

/** An entry is four words; its first holds its kind in the low four bits, the added flag, and an archetype from bit 8. */
export const entryWords = 4;
export const kindMask = 15;
export const addedFlag = 16;
export const archetypeShift = 8;

/** A sync's first entry for the thread: its tick, low and high words. */
export const syncEntry = 1;
/** A row moving between archetypes both holding the thread's objects: from archetype and row, to archetype and row. */
export const moveEntry = 2;
/** A row filled in an archetype holding the thread's objects, every one of them at its start: its row and entity. */
export const appendEntry = 3;
/** Rows filled from `row`, `count` of them, each at its starts, followed by their entities, two to an entry. */
export const rangeEntry = 4;
/** A row removed, the last row moved into it: the last row, then the row; equal when the removed row was last. */
export const swapEntry = 5;
/** A value given to the thread's object in a row: the row, the component, and its tag; added when it starts there. */
export const setEntry = 6;

/**
 * Tags: the component's start, `null`, a value the thread's systems wrote, which it keeps by entity, or a staged slot's
 * value, by the slot's id plus `slotTags`.
 */
export const startTag = 0;
export const nullTag = 1;
export const ownTag = 2;
export const slotTags = 3;

/** Entries a log holds at least. */
export const minimumEntries = 4096;
/** Entries the writer may write past what it last stored as its limit. */
const limitStep = 64;

/** A value the thread that fills a component gave it, staged there under its slot's id: no other thread holds one. */
export type SlotValue = { readonly [slotOf]: number };
const slotOf = Symbol("slot");

export const slotValue = (slot: number): SlotValue => ({ [slotOf]: slot });

/** A value's tag in its storage, or -1 for a value another thread can't give an object it doesn't hold. */
export const tagOf = (value: unknown, start: unknown): number => {
    if (value === start || value === undefined) return startTag;
    if (value === null) return nullTag;
    return typeof value === "object" && slotOf in value ? (Number(Reflect.get(value, slotOf)) + slotTags) >>> 0 : -1;
};

/** The world's end of a joined thread's log. */
export type MoveLog = {
    /** The joined thread's number, which storage flags in the layout directory name. */
    readonly thread: number;
    readonly memory: Memory;
    readonly header: Int32Array;
    /** The header block's offset, which the thread is posted. */
    readonly block: number;
    ring: Uint32Array;
    ringEntities: Float64Array;
    mask: number;
    /** The next entry's position, and the limit last stored. */
    position: number;
    limit: number;
    /** The current sync's tick, and whether its sync entry is written. */
    tick: number;
    headed: boolean;
    /** By component id, what each starts at, as the world resolves it. */
    readonly starts: readonly unknown[];
    /** Archetypes holding the thread's objects, whose rows size the ring. */
    readonly archetypes: Archetype[];
    readonly minimum: number;
    /** Tells the thread a component it fills, once the world met it. */
    readonly announce: (component: number) => void;
};

const powerOfTwo = (entries: number): number => 2 ** Math.ceil(Math.log2(Math.max(entries, 1)));

const placeRing = (log: MoveLog, capacity: number): void => {
    const { memory, header } = log;
    const offset = memory.allocate(capacity * entryWords * 4);
    const buffer = memory.memory.buffer;
    log.ring = new Uint32Array(buffer, offset, capacity * entryWords);
    log.ringEntities = new Float64Array(buffer, offset, capacity * 2);
    log.mask = capacity - 1;
    header[logOffsetWord] = offset;
    header[logCapacityWord] = capacity;
    Atomics.add(header, logVersionWord, 1);
};

/** A log in shared memory for joined thread `thread`, its ring holding `minimum` entries at least. */
export const createMoveLog = (memory: Memory, thread: number, starts: readonly unknown[], announce: (component: number) => void, minimum = minimumEntries): MoveLog => {
    const block = memory.allocate(logHeaderBytes);
    const header = new Int32Array(memory.memory.buffer, block, logHeaderBytes / 4).fill(0);
    const log: MoveLog = {
        thread, memory, header, block, ring: new Uint32Array(0), ringEntities: new Float64Array(0), mask: 0, position: 0, limit: 0,
        tick: -1, headed: false, starts, archetypes: [], minimum: powerOfTwo(minimum), announce,
    };
    placeRing(log, log.minimum);
    return log;
};

/** Returns the log's blocks to the memory, once its thread left: a thread that died may still be reading it. */
export const freeMoveLog = (log: MoveLog): void => {
    log.memory.free(log.header[logOffsetWord], (log.mask + 1) * entryWords * 4);
    log.memory.free(log.block, logHeaderBytes);
};

/**
 * At the start of a sync point: its tick, and a ring holding the rows of the archetypes with the thread's objects,
 * replaced while it's too small. The old block is freed, so a thread reading it sees the version move, and rebuilds.
 */
export const beginLog = (log: MoveLog, tick: number): void => {
    log.tick = tick;
    log.headed = false;
    let rows = 0;
    for (const archetype of log.archetypes) rows += archetype.count;
    if (rows <= log.mask + 1) return;
    const old = log.header[logOffsetWord];
    const oldBytes = (log.mask + 1) * entryWords * 4;
    placeRing(log, Math.max(log.minimum, powerOfTwo(rows)));
    log.memory.free(old, oldBytes);
};

/** Stores a limit past the next entries before writing them, so a reader copying older entries can tell they lapped. */
const extendLimit = (log: MoveLog): void => {
    log.limit = (log.position + limitStep) >>> 0;
    Atomics.store(log.header, logLimitWord, log.limit);
};

const put = (log: MoveLog, first: number, second: number, third: number, fourth: number): void => {
    if (log.position === log.limit) extendLimit(log);
    const at = (log.position & log.mask) * entryWords;
    const { ring } = log;
    ring[at] = first;
    ring[at + 1] = second;
    ring[at + 2] = third;
    ring[at + 3] = fourth;
    log.position = (log.position + 1) >>> 0;
};

/** An entry, after the sync's own the first time. */
const entry = (log: MoveLog, first: number, second: number, third: number, fourth: number): void => {
    if (!log.headed) {
        log.headed = true;
        put(log, syncEntry, log.tick >>> 0, Math.floor(log.tick / 0x100000000), 0);
    }
    put(log, first, second, third, fourth);
};

export const logMove = (log: MoveLog, from: number, fromRow: number, to: number, toRow: number): void =>
    entry(log, moveEntry | (from << archetypeShift), fromRow, to, toRow);

export const logAppend = (log: MoveLog, archetype: number, row: number, entity: number): void =>
    entry(log, appendEntry | (archetype << archetypeShift), row, entity >>> 0, Math.floor(entity / 0x100000000));

/** Rows `row` to `row + count` filled with `entities[first]` on. */
export const logRange = (log: MoveLog, archetype: number, row: number, count: number, entities: Float64Array, first: number): void => {
    entry(log, rangeEntry | (archetype << archetypeShift), row, count, 0);
    for (let k = 0; k < count; k += 2) {
        put(log, 0, 0, 0, 0);
        const at = ((log.position - 1) & log.mask) * 2;
        log.ringEntities[at] = entities[first + k];
        log.ringEntities[at + 1] = k + 1 < count ? entities[first + k + 1] : 0;
    }
};

export const logSwap = (log: MoveLog, archetype: number, last: number, row: number): void =>
    entry(log, swapEntry | (archetype << archetypeShift), last, row, 0);

export const logSet = (log: MoveLog, archetype: number, row: number, component: number, tag: number, added: boolean): void =>
    entry(log, setEntry | (added ? addedFlag : 0) | (archetype << archetypeShift), row, component, tag);

/** At the end of a sync point: its entries, then the sync, published, each by a store the thread loads. */
export const publishLog = (log: MoveLog): void => {
    if (log.tick < 0) return;
    if (log.headed) Atomics.store(log.header, logPublishedWord, log.position);
    Atomics.store(log.header, logSyncWord, log.tick >>> 0);
    log.tick = -1;
    log.headed = false;
};

/** Once observers were delivered: through the sync last published, waking a thread waiting for it. */
export const markDelivered = (log: MoveLog): void => {
    const { header } = log;
    const sync = header[logSyncWord];
    if (header[logDeliveredWord] === sync) return;
    Atomics.store(header, logDeliveredWord, sync);
    Atomics.notify(header, logDeliveredWord);
};
