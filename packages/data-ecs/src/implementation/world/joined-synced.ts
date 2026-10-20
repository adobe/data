import type { Leaf } from '../../interface/system/leaf.js';
import type { Lookup } from '../../interface/system/access.js';
import { idOfItem, idOfKey, indexOfLookup, labelOf, labelOfItem } from '../../interface/registry/index.js';
import { readCell } from './cells.js';
import { readAhead } from './execute.js';
import { refreshUses, type WorldIndex } from './indexes.js';
import { writeIndexParameters } from './kernel-indexes.js';
import { flushBetween, countChanged } from './layout-directory.js';
import { logSyncWord, type MoveLog } from './move-log.js';
import { lineWords } from './protocol.js';
import type { ToJoined } from './joining.js';
import { keysOf, liftColumns } from './remote-systems.js';
import { findResource } from './resources.js';
import { createRunner, type Runner } from './runner.js';
import { idOf, type Key, type State } from './state.js';
import { doneWord, endWord, progressWord, snapshotFlagsWord, snapshotOffsetWord, snapshotRowsWord, snapshotStartWord, snapshotted, tailBlockWords, waitingWord } from './tail-blocks.js';
import { copyRest, waitDone, type Copied } from './tails.js';
import { recordWordsOf } from './thread-indexes.js';
import type { Pool } from './pool.js';
import { chunkShift } from './kernel.js';

// Synced systems on joined threads (threads.md, "Synced systems on joined threads"): after each sync point the world
// checks each one's conditions and filters and posts those that may run into their blocks, waking each thread once.
// The thread claims a post, reads the shared memory as of that sync point, and runs the system there. A writer of what
// a post still reads first copies the rest of its rows and resources, as for tails, or, for what its lookups read,
// waits for it to finish once it started and cancels it before; each sync point waits for a post in progress and
// cancels the others, which the next post replaces, so a thread that fell behind runs once, for the newest.

/** A synced block: a tail block (`tail-blocks.ts`), then a line of its own. */
const syncedLine = tailBlockWords;
/** Posts so far, which the world adds to last as it posts; a thread runs a post once. */
export const postedWord = syncedLine;
/** What the thread did with the post, stored before its done word: not run, run skipped, or run taking its tick. */
export const outcomeWord = syncedLine + 1;
export const notRun = 0;
export const ranSkipped = 1;
export const ranExecuted = 2;
/** Set once the world removed the system, which the thread checks before it claims a post. */
export const removedWord = syncedLine + 2;
/** The newest run of the joined thread the post is for, its sequence, or 0 for none. */
export const runsWord = syncedLine + 3;
/** The sync of the thread's log the post is as of, which its objects are replayed through first. */
export const syncWord = syncedLine + 4;
/** From this f64 word of the block: the tick the post takes as its `lastRun` once it ran, then the `lastRun` it filters by. */
export const tickSlot = (syncedLine + 8) / 2;
export const syncedBlockWords = tailBlockWords + lineWords;
const syncedBlockBytes = syncedBlockWords * 4;
/** What the progress word holds once the world cancelled a post no claim reached: claims add to it and stay past it. */
export const cancelled = 0x60000000;

/** A joined thread's end for synced systems: how its setups reach it, how it's woken, and where they're placed. */
export type SyncedTarget = {
    /** The joined thread's number and the threads it claims, for labels. */
    readonly thread: number;
    readonly label: string;
    readonly post: (message: ToJoined) => void;
    /** Wakes the thread once, after this turn's posts. */
    readonly wake: () => void;
    /** Its log, once it fills objects: a post names the sync its objects are replayed through. */
    log: MoveLog | null;
    /** Once gone: its posts settle, and nothing more is posted. */
    ended: boolean;
    left: boolean;
    readonly end: Promise<void>;
    readonly finish: () => void;
    /** By index there, what's placed; indexes it dropped, placed again first. */
    readonly placed: (JoinedSynced | undefined)[];
    readonly free: number[];
};

/** A lookup through an index by a synced system on a joined thread, through a record the world writes before each post. */
type Record = { readonly index: WorldIndex; readonly watched: readonly number[]; readonly record: number; readonly words: number };

/** A synced system placed on a joined thread: its block, what it reads, and its post's state. */
export type JoinedSynced = Copied & {
    readonly target: SyncedTarget;
    readonly index: number;
    readonly label: string;
    readonly runner: Runner;
    /** Struct components its lookups read or watch, and the key parts of the indexes they go through. */
    readonly lookupReads: readonly number[];
    readonly watched: readonly number[];
    readonly filtered: boolean;
    readonly records: readonly Record[];
    readonly ticks: Float64Array;
    lastRun: number;
    /** While posted and not settled: the tick it takes, and whether a writer copied its reads already. */
    live: boolean;
    tick: number;
    copied: boolean;
    /** Posts of it cancelled since it last ran: past `cancelsBeforeWaiting`, the next is waited for instead. */
    cancels: number;
    /** The newest run it's owed to, which it's posted for until it ran: 0 for one of the world's, -1 for none. */
    pending: number;
    stopped: boolean;
    /** Whether the thread dropped it, so its block can go once no post is live. */
    dropped: boolean;
    freed: boolean;
};

/** What the world keeps of synced systems on joined threads. */
export type SyncedState = {
    /** Posts not yet settled. */
    readonly posts: JoinedSynced[];
    /** Those owed to a run, posted after every sync point until they ran. */
    readonly pending: Set<JoinedSynced>;
    /** By logical thread a joined thread claims, its end. */
    readonly targets: Map<string, SyncedTarget>;
    /** A joined thread's own synced systems, as the world declares them: their thread, and its number for them. */
    readonly proxies: WeakMap<Leaf, { readonly target: SyncedTarget; readonly local: number; readonly label: string }>;
    /** How many are placed, while which directory counts are kept. */
    count: number;
    /** Posts again, between runs, what's owed to a run once a post was cancelled outside a sync point. */
    again: (() => void) | null;
};

export const createSyncedState = (): SyncedState => ({ posts: [], pending: new Set(), targets: new Map(), proxies: new WeakMap(), count: 0, again: null });

/** A joined thread's end. */
export const createSyncedTarget = (thread: number, label: string, post: (message: ToJoined) => void, wake: () => void): SyncedTarget => {
    let finish = (): void => {};
    const end = new Promise<void>(resolve => { finish = resolve; });
    return { thread, label, post, wake, log: null, ended: false, left: false, end, finish, placed: [], free: [] };
};

const unique = (ids: readonly number[]): readonly number[] => [...new Set(ids)];

const lookupReadsOf = (state: State, lookup: { readonly [name: string]: Lookup } | undefined): { readonly reads: readonly number[]; readonly watched: readonly number[] } => {
    const reads: number[] = [];
    const watched: number[] = [];
    for (const name in lookup) {
        const declared = lookup[name];
        const index = indexOfLookup(declared);
        const changed = "changed" in declared ? declared.changed ?? [] : [];
        for (const key of [...declared.read ?? [], ...changed, ...index?.declaration.key ?? []]) reads.push(idOf(state, key));
        if (index === undefined) for (const key of changed) watched.push(idOf(state, key));
    }
    return { reads: unique(reads.filter(id => state.layouts[id].kind !== "object")), watched: unique(watched) };
};

/** Starts keeping directory counts current, which a joined thread's synced systems read, if they weren't. */
const startCounting = (state: State): void => {
    if (state.counting) return;
    state.counting = true;
    for (const archetype of state.archetypes) countChanged(state.counted, archetype);
    flushBetween(state.directory, state.bumped, state.archetypes, state.entities, state.resourceEntity, state.counted);
};

/**
 * A runner for a synced system placed on a joined thread: the world's runner over its query, which it never starts,
 * for what it matches and the indexes it looks up through; its block; and its setup posted to the thread. `since` is
 * the tick it last ran at.
 */
export const createJoinedSyncedRunner = (state: State, leaf: Leaf, target: SyncedTarget, since = 0): Runner => {
    const base = createRunner(state, leaf, since);
    const { declaration } = leaf;
    const { components, resources } = declaration;
    const ids = (keys: readonly Key[] | undefined): number[] => [...new Set((keys ?? []).map(key => idOf(state, key)))];
    const isStruct = (id: number): boolean => state.layouts[id].kind !== "object";
    const linear = (list: readonly number[]): { ids: number[]; strides: number[] } => {
        const found: number[] = [];
        const strides: number[] = [];
        for (const id of list) {
            const layout = state.layouts[id];
            if (layout.kind !== "linear") continue;
            found.push(id);
            strides.push(layout.stride);
        }
        return { ids: found, strides };
    };
    const contextKeys = [...new Set<Key>([...resources?.read ?? [], ...resources?.is ?? []])];
    const reads = linear(ids(components?.read));
    const resourceReads = linear(contextKeys.map(key => idOf(state, key)));
    const looked = lookupReadsOf(state, declaration.lookup);
    const block = state.memory.allocate(syncedBlockBytes);
    const buffer = state.memory.memory.buffer;
    const control = new Int32Array(buffer, block, syncedBlockWords).fill(0);
    const records: Record[] = [];
    const named: (readonly [string, number])[] = [];
    for (const [name, index] of base.holdings.indexes?.byName ?? []) {
        const declared = declaration.lookup?.[name];
        const watched = (declared !== undefined && "changed" in declared ? declared.changed ?? [] : []).map(key => idOf(state, key));
        const words = recordWordsOf(index.sorted !== null, watched.length);
        const record = state.memory.allocate(8 * words);
        records.push({ index, watched, record, words });
        named.push([name, record]);
    }
    const index = target.free.pop() ?? target.placed.length;
    const proxy = state.synced.proxies.get(leaf);
    const synced: JoinedSynced = {
        target, index, label: proxy?.label ?? labelOfItem(leaf), runner: base,
        matched: base.matched,
        reads: ids([...components?.read ?? [], ...components?.added ?? [], ...components?.changed ?? []]).filter(isStruct),
        resourceReads: ids([...resources?.read ?? [], ...resources?.is ?? [], ...resources?.not ?? [], ...resources?.changed ?? []]).filter(isStruct),
        linear: reads.ids, strides: reads.strides, resources: resourceReads.ids, resourceStrides: resourceReads.strides,
        writes: [], resourceObjectWrites: [],
        added: ids(components?.added), changed: ids(components?.changed), resourceChanged: ids(resources?.changed),
        conditionIs: ids(resources?.is), conditionNot: ids(resources?.not),
        query: components !== undefined, block, control, snapshot: null, end: 0, lastRun: since,
        gone: () => target.ended, idle: () => target.end,
        lookupReads: looked.reads, watched: looked.watched,
        filtered: (components?.added?.length ?? 0) + (components?.changed?.length ?? 0) + (resources?.changed?.length ?? 0) > 0,
        records, ticks: new Float64Array(buffer, block + tickSlot * 8, 2),
        live: false, tick: 0, copied: false, cancels: 0, pending: -1, stopped: false, dropped: false, freed: false,
    };
    target.placed[index] = synced;
    state.synced.count++;
    startCounting(state);
    const keys = keysOf(leaf).map((key): readonly [number, string] => [idOf(state, key), idOfKey(key) ?? ""]);
    target.post({
        protocol: "@adobe/data-ecs/join@1", kind: "synced",
        systems: [{ index, local: proxy?.local ?? null, id: proxy === undefined ? idOfItem(leaf) ?? null : null, keys, block, indexes: named }],
    });
    base.holdings.remote = { unplace: () => stop(state, synced) };
    return { ...base, joined: synced, lastRun: () => synced.lastRun };
};

/** Frees a stopped system's block and records once the thread dropped it, or left, and no post of it is live. */
const tryFree = (state: State, synced: JoinedSynced): void => {
    if (synced.freed || !synced.stopped || synced.live || !(synced.dropped || synced.target.left)) return;
    synced.freed = true;
    if (synced.snapshot !== null) state.memory.free(synced.snapshot.offset, synced.snapshot.bytes);
    synced.snapshot = null;
    state.memory.free(synced.block, syncedBlockBytes);
    for (const { record, words } of synced.records) state.memory.free(record, 8 * words);
    const { target } = synced;
    if (target.placed[synced.index] === synced) {
        target.placed[synced.index] = undefined;
        if (!target.ended) target.free.push(synced.index);
    }
};

/**
 * Stops a synced system on a joined thread, as it's removed: the thread runs no post of it once this returns, checking
 * its removed word before it claims one; and it's told to drop it, its block freed once it did.
 */
const stop = (state: State, synced: JoinedSynced): void => {
    if (synced.stopped) return;
    synced.stopped = true;
    Atomics.store(synced.control, removedWord, 1);
    state.synced.pending.delete(synced);
    synced.pending = -1;
    state.synced.count--;
    if (state.synced.count === 0 && !state.claimed) state.counting = false;
    if (!synced.target.ended) synced.target.post({ protocol: "@adobe/data-ecs/join@1", kind: "unsynced", indexes: [synced.index] });
    tryFree(state, synced);
};

/** The thread dropped what it held for systems at these indexes. */
export const droppedSynced = (state: State, target: SyncedTarget, indexes: readonly number[]): void => {
    for (const index of indexes) {
        const synced = target.placed[index];
        if (synced === undefined || !synced.stopped) continue;
        synced.dropped = true;
        tryFree(state, synced);
    }
};

/** Once a joined thread is gone: its posts settle, and, once it left, its blocks are freed. */
export const endTarget = (state: State, target: SyncedTarget, left: boolean): void => {
    target.ended = true;
    target.left = left;
    target.finish();
    for (const synced of target.placed) {
        if (synced === undefined) continue;
        state.synced.pending.delete(synced);
        synced.pending = -1;
        tryFree(state, synced);
    }
};

const holding = (state: State, id: number): boolean => {
    // An object here may be a joined thread's own, which only it reads: that thread checks it.
    if (state.layouts[id].kind === "object") return true;
    const cell = findResource(state, state.keys[id]);
    if (cell === undefined) return false;
    const held = readCell(cell.storage, cell.row);
    return held !== null && held !== false;
};

/**
 * Whether a synced system may run after this sync point: its conditions hold, and, with change filters, a resource it
 * filters on changed or a chunk of a component it filters on in an archetype it matches was stamped since it last ran.
 */
const mayRun = (state: State, synced: JoinedSynced): boolean => {
    const { lastRun } = synced;
    for (const id of synced.conditionIs) if (!holding(state, id)) return false;
    for (const id of synced.conditionNot) if (holding(state, id)) return false;
    if (!synced.filtered) return true;
    for (const id of synced.resourceChanged) {
        const cell = findResource(state, state.keys[id]);
        if (cell !== undefined && cell.storage.changed[cell.row] > lastRun) return true;
    }
    if (synced.added.length + synced.changed.length === 0) return false;
    for (const archetype of synced.matched()) {
        if (archetype.count === 0) continue;
        const chunks = ((archetype.count - 1) >> chunkShift) + 1;
        for (const id of synced.added) {
            const storage = archetype.storageById[id];
            if (storage === undefined) continue;
            for (let chunk = 0; chunk < chunks; chunk++) if (storage.chunkAdded[chunk] > lastRun) return true;
        }
        for (const id of synced.changed) {
            const storage = archetype.storageById[id];
            if (storage === undefined) continue;
            if (storage.columnChanged > lastRun) return true;
            for (let chunk = 0; chunk < chunks; chunk++) if (storage.chunkChanged[chunk] > lastRun) return true;
        }
    }
    return false;
};

/** Parameters of an index lookup, reused, and a view of the memory they're copied into. */
const parameters: number[] = [];
let words = new Float64Array(0);

/** Writes a post into a system's block: its work's end, its filters' `lastRun`, its tick and the run it's for. */
const write = (state: State, synced: JoinedSynced, tick: number): void => {
    const { control } = synced;
    let rows = 0;
    if (synced.query) for (const archetype of synced.matched()) rows += archetype.count;
    synced.end = 1 + rows;
    // A GPU kernel's whole-column stamps reach the thread as row ticks.
    if (synced.changed.length > 0) for (const archetype of synced.matched()) liftColumns(archetype, synced.changed, synced.lastRun);
    if (synced.watched.length > 0) for (const archetype of state.archetypes) liftColumns(archetype, synced.watched, synced.lastRun);
    if (synced.records.length > 0) {
        if (words.buffer !== state.memory.memory.buffer) words = new Float64Array(state.memory.memory.buffer);
        for (const { index, watched, record } of synced.records) {
            const count = writeIndexParameters({ index, watched }, synced.lastRun, parameters, 0);
            for (let k = 0; k < count; k++) words[record / 8 + k] = parameters[k];
        }
    }
    for (const word of [progressWord, doneWord, waitingWord, snapshotOffsetWord, snapshotRowsWord, snapshotStartWord, snapshotFlagsWord, outcomeWord]) Atomics.store(control, word, 0);
    Atomics.store(control, endWord, synced.end);
    Atomics.store(control, runsWord, Math.max(synced.pending, 0));
    Atomics.store(control, syncWord, synced.target.log === null ? 0 : Atomics.load(synced.target.log.header, logSyncWord));
    synced.ticks[0] = tick;
    synced.ticks[1] = synced.lastRun;
    synced.tick = tick;
    synced.copied = false;
    synced.live = true;
    state.synced.posts.push(synced);
    // Last: a thread that sees it sees the rest.
    Atomics.add(control, postedWord, 1);
    synced.target.wake();
};

const noSynced: readonly JoinedSynced[] = [];

/**
 * After a sync point: posts the synced systems on joined threads among those of the run, `own`, which are owed to run
 * `run` (0 for one of the world's), those added, `added`, that may run, and those still owed to a run. Refreshes the
 * indexes they look up through and reads back what the GPU wrote that they read first; a promise only when that waits.
 */
export const postSynced = (state: State, own: readonly JoinedSynced[], added: readonly JoinedSynced[], run: number, pool: Pool | null): Promise<void> | null => {
    const { pending } = state.synced;
    for (let k = 0; k < own.length; k++) {
        const synced = own[k];
        if (synced.stopped || synced.target.ended) continue;
        synced.pending = Math.max(synced.pending, run);
        pending.add(synced);
    }
    let posting: JoinedSynced[] | null = null;
    for (const synced of pending) if (!synced.live) (posting ??= []).push(synced);
    for (let k = 0; k < added.length; k++) {
        const synced = added[k];
        if (synced.live || synced.stopped || synced.target.ended || synced.pending >= 0 || !mayRun(state, synced)) continue;
        (posting ??= []).push(synced);
    }
    if (posting === null) return null;
    const chosen = posting;
    let waiting: Promise<unknown>[] | null = null;
    for (const synced of chosen) {
        const uses = synced.runner.indexes;
        if (uses.length === 0) continue;
        const building = refreshUses(state, uses, pool);
        if (building !== null) (waiting ??= []).push(building);
    }
    const { gpu } = state;
    if (gpu !== null && gpu.anyAhead()) (waiting ??= []).push(readAhead(state, gpu, chosen.map(synced => synced.runner)));
    const post = (): void => {
        const tick = ++state.tick;
        for (const synced of chosen) if (!synced.live && !synced.stopped && !synced.target.ended) write(state, synced, tick);
    };
    if (waiting === null) {
        post();
        return null;
    }
    return Promise.all(waiting).then(post);
};

/** The synced systems on joined threads among runners. */
export const joinedOf = (runners: readonly Runner[]): readonly JoinedSynced[] => {
    let found: JoinedSynced[] | null = null;
    for (let k = 0; k < runners.length; k++) {
        const { joined } = runners[k];
        if (joined !== null) (found ??= []).push(joined);
    }
    return found ?? noSynced;
};

/** Settles a post: what the thread did with it, the tick it took, and whether it's still owed to a run. */
const settle = (state: State, synced: JoinedSynced): void => {
    if (!synced.live) return;
    synced.live = false;
    const at = state.synced.posts.indexOf(synced);
    if (at >= 0) state.synced.posts.splice(at, 1);
    const outcome = Atomics.load(synced.control, outcomeWord);
    if (outcome !== notRun) synced.cancels = 0;
    if (outcome === ranExecuted) synced.lastRun = synced.tick;
    if (outcome !== notRun && synced.pending >= 0 && Atomics.load(synced.control, runsWord) >= synced.pending) {
        synced.pending = -1;
        state.synced.pending.delete(synced);
    }
    tryFree(state, synced);
};

/**
 * Posts of a system cancelled in a row before the next is waited for instead, so a thread slower to claim than the
 * world is to write runs it at least once in this many sync points plus one, however fast the world ticks.
 */
export const cancelsBeforeWaiting = 4;

/**
 * Cancels a post no claim reached, settling it; false once the thread claimed it, or when it's the one after
 * `cancelsBeforeWaiting` cancelled ones, which the caller waits for.
 */
const cancel = (state: State, synced: JoinedSynced): boolean => {
    const { control } = synced;
    if (!synced.stopped && synced.cancels >= cancelsBeforeWaiting) return false;
    if (Atomics.compareExchange(control, progressWord, 0, cancelled) !== 0 && Atomics.compareExchange(control, progressWord, snapshotted, cancelled) !== snapshotted) return false;
    synced.cancels++;
    settle(state, synced);
    return true;
};

/** Waits for a post in progress to finish, then settles it. */
const finish = (state: State, synced: JoinedSynced): Promise<void> | null => {
    if (Atomics.load(synced.control, doneWord) >= synced.end) {
        settle(state, synced);
        return null;
    }
    return waitDone(synced, synced.end).then(() => settle(state, synced));
};

const gather = (waits: Promise<void>[] | null, next: Promise<void> | null): Promise<void>[] | null => {
    if (next === null) return waits;
    (waits ??= []).push(next);
    return waits;
};

const joinAll = (waits: Promise<void>[] | null): Promise<void> | null => waits === null ? null : waits.length === 1 ? waits[0] : Promise.all(waits).then(() => undefined);

/**
 * Before a sync point, or what moves rows outside one: waits for every post in progress and cancels the rest, so the
 * next post, for the newest sync, replaces them. `between`: outside a sync point, where what's owed to a run is posted
 * again once it's done.
 */
export const settlePosts = (state: State, between = false): Promise<void> | null => {
    let waits: Promise<void>[] | null = null;
    let owed = false;
    for (const synced of [...state.synced.posts]) {
        if (cancel(state, synced)) {
            if (synced.pending >= 0) owed = true;
            continue;
        }
        waits = gather(waits, finish(state, synced));
    }
    if (between && owed) state.synced.again?.();
    return joinAll(waits);
};

const any = (ids: readonly number[], among: readonly number[]): boolean => {
    for (let i = 0; i < ids.length; i++) if (among.includes(ids[i])) return true;
    return false;
};

/**
 * Before a writer of components `components` and resources `resources`: each post reading what its lookups read is
 * waited for once it started and cancelled before; each reading its rows or resources has the rest of them copied.
 */
const settleWrites = (state: State, components: readonly number[], resources: readonly number[]): Promise<void> | null => {
    let waits: Promise<void>[] | null = null;
    for (const synced of [...state.synced.posts]) {
        if (synced.lookupReads.length > 0 && any(components, synced.lookupReads)) {
            if (!cancel(state, synced)) waits = gather(waits, finish(state, synced));
            continue;
        }
        if (synced.copied || !(any(components, synced.reads) || any(resources, synced.resourceReads))) continue;
        synced.copied = true;
        waits = gather(waits, copyRest(state, synced));
    }
    return joinAll(waits);
};

/** Before runners that write components or resources. */
export const settleSyncedRunners = (state: State, runners: readonly Runner[]): Promise<void> | null => {
    let waits: Promise<void>[] | null = null;
    for (let k = 0; k < runners.length; k++) {
        const { writes, resourceWrites } = runners[k];
        if (writes.length + resourceWrites.length > 0) waits = gather(waits, settleWrites(state, writes, resourceWrites));
    }
    return joinAll(waits);
};

/** Before the world writes these components or resources itself, as GPU readbacks and the clock do. */
export const settleSyncedKeys = (state: State, components: readonly number[], resources: readonly number[]): Promise<void> | null =>
    settleWrites(state, components, resources);

/** Why a synced system's key can't cross to a joined thread, or null when every one can. */
export const unnamedKey = (leaf: Leaf): string | null => {
    const unnamed = keysOf(leaf).find(key => idOfKey(key) === undefined);
    return unnamed === undefined ? null : `System "${labelOfItem(leaf)}" names "${labelOf(unnamed)}", which has no id, so a joined thread can't name it; the build gives top-level keys one.`;
};

/** Runs of synced systems from joined threads, by the value standing for their input: the run's sequence there. */
const joinedRuns = new WeakMap<object, number>();

/** What a joined thread's run of its own synced system passes for input, naming the run. */
export const joinedRun = (sequence: number): object => {
    const run = {};
    joinedRuns.set(run, sequence);
    return run;
};

/** The sequence of the joined run a run's input names, or 0 for one that names none. */
export const joinedRunOf = (value: unknown): number => typeof value === "object" && value !== null ? joinedRuns.get(value) ?? 0 : 0;
