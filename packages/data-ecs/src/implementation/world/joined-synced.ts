import type { Leaf } from '../../interface/system/leaf.js';
import type { Lookup } from '../../interface/system/access.js';
import { idOfItem, idOfKey, indexOfLookup, labelOf, labelOfItem, threadOf } from '../../interface/registry/index.js';
import type { Archetype } from './archetype.js';
import { readCell } from './cells.js';
import { indexOf } from './entities.js';
import { readAhead } from './execute.js';
import { refreshUses, type WorldIndex } from './indexes.js';
import { writeIndexParameters } from './kernel-indexes.js';
import { flushBetween, countChanged } from './layout-directory.js';
import { logSyncWord, type MoveLog } from './move-log.js';
import { lineWords } from './protocol.js';
import type { ToJoined } from './joining.js';
import { keysOf, liftColumns } from './remote-systems.js';
import { createRunner, type Runner } from './runner.js';
import { idOf, type Key, type State } from './state.js';
import {
    doneWord, endWord, headExecuted, headRan, progressWord, snapshotCapacityWord, snapshotFlagsWord, snapshotLayout, snapshotOffsetWord, snapshotResourceArchetypeWord,
    snapshotResourceRowWord, snapshotRowsWord, snapshotStartWord, snapshotted, tailBlockWords, waitingWord, type SnapshotLayout,
} from './tail-blocks.js';
import { copyRest, waitDone, type Copied } from './tails.js';
import { recordWordsOf } from './thread-indexes.js';
import type { Pool } from './pool.js';
import { chunkShift } from './kernel.js';

// Synced systems on joined threads (threads.md, "Synced systems on joined threads"): after each sync point the world
// checks each one's conditions and filters and posts those that may run into their blocks, waking each thread once.
// The thread claims a post, reads the shared memory as of that sync point, and runs the system there. A writer of what
// a post still reads first copies the rest of its rows and resources, as for tails, or, for what its lookups read,
// waits for it to finish once it started and cancels it before; each sync point waits for a post in progress and
// cancels the others, which the next post replaces, so a thread that fell behind runs once, for the newest. A system
// reading only struct resources posts copies of them, so neither writers nor sync points touch its posts: the next post
// cancels one no claim reached, and is written into a second block while one runs, so the world never waits for it.

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
/**
 * What the progress word holds while the world writes a post: a thread that saw the last post's posted word and claims
 * now claims nothing, and claims again once the post is open, after its posted word moved.
 */
export const opening = 0x70000000;

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
    /** For one reading only struct resources, no rows or lookups: its posts' two places. */
    readonly contained: Contained | null;
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

/**
 * One of two places for posts of a system reading only struct resources: a block and where its snapshot is, and its
 * post as written: its work's end, a new one for each post, so the thread's done word from the last needs no reset; its
 * tick; and its head flags, written only when they change.
 */
type Slot = {
    readonly block: number;
    readonly control: Int32Array;
    readonly ticks: Float64Array;
    readonly snapshot: number;
    /** Whether its snapshot is the block's own, so a post writes only its first and last lines. */
    readonly inline: boolean;
    /** Holding a post the thread may still claim or be running. */
    live: boolean;
    /** Whether its post's outcome was taken already, as the thread ran it, since it was running when the next was due. */
    ahead: boolean;
    end: number;
    tick: number;
    flags: number;
};

/**
 * Posts of a system reading only struct resources hold its resources' values and head flags, so the thread reads only
 * its block; the post after one the thread is running goes into the other block. The thread claims and runs one post
 * at a time, so the other block's post is done by then, and only the newest is ever unclaimed.
 */
type Contained = { readonly layout: SnapshotLayout; readonly slots: readonly [Slot, Slot]; current: number };

/** The bytes at the end of a synced block that hold a contained post's resources when they fit. */
const inlineByte = (syncedLine + 12) * 4;
const inlineBytes = syncedBlockBytes - inlineByte;

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
    // One placed there by the objects it names, rather than the thread's own, is named there by its id and its keys'.
    if (!state.synced.proxies.has(leaf)) {
        if (idOfItem(leaf) === undefined) {
            const thread = threadOf(leaf.declaration, "System", leaf.name) ?? target.label;
            throw new Error(`System "${labelOfItem(leaf)}" runs on thread "${thread}", which a joined thread fills, and has no id, so that thread can't name it; the build gives top-level systems one.`);
        }
        const unnamed = unnamedKey(leaf);
        if (unnamed !== null) throw new Error(unnamed);
    }
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
    const resourceIds = ids([...resources?.read ?? [], ...resources?.is ?? [], ...resources?.not ?? [], ...resources?.changed ?? []]);
    const layout = components === undefined && records.length === 0 && Object.keys(declaration.lookup ?? {}).length === 0 && resourceIds.every(isStruct)
        ? snapshotLayout(1, [], resourceReads.strides)
        : null;
    const slotAt = (at: number, slotLayout: SnapshotLayout): Slot => {
        const views = state.memory.memory.buffer;
        const slotControl = new Int32Array(views, at, syncedBlockWords).fill(0);
        // Resources that fit sit in the block's last line, with the post's other words, its snapshot laid out to end there.
        const inline = slotLayout.bytes - slotLayout.resources[0] <= inlineBytes;
        const snapshot = inline ? at + inlineByte - slotLayout.resources[0] : state.memory.allocate(slotLayout.bytes);
        // What every post of it says of its snapshot but its flags.
        slotControl[snapshotOffsetWord] = snapshot;
        slotControl[snapshotCapacityWord] = 1;
        slotControl[snapshotResourceArchetypeWord] = -1;
        return {
            block: at, control: slotControl, ticks: new Float64Array(views, at + tickSlot * 8, 2), snapshot, inline,
            live: false, ahead: false, end: 0, tick: 0, flags: 0,
        };
    };
    const contained: Contained | null = layout === null ? null : { layout, slots: [slotAt(block, layout), slotAt(state.memory.allocate(syncedBlockBytes), layout)], current: 0 };
    const index = target.free.pop() ?? target.placed.length;
    const proxy = state.synced.proxies.get(leaf);
    const synced: JoinedSynced = {
        target, index, label: proxy?.label ?? labelOfItem(leaf), runner: base,
        matched: base.matched,
        reads: ids([...components?.read ?? [], ...components?.added ?? [], ...components?.changed ?? []]).filter(isStruct),
        resourceReads: resourceIds.filter(isStruct),
        linear: reads.ids, strides: reads.strides, resources: resourceReads.ids, resourceStrides: resourceReads.strides,
        writes: [], resourceObjectWrites: [],
        added: ids(components?.added), changed: ids(components?.changed), resourceChanged: ids(resources?.changed),
        conditionIs: ids(resources?.is), conditionNot: ids(resources?.not),
        query: components !== undefined, block, control: contained?.slots[0].control ?? control, snapshot: null, end: 0, lastRun: since,
        gone: () => target.ended, idle: () => target.end,
        lookupReads: looked.reads, watched: looked.watched,
        filtered: (components?.added?.length ?? 0) + (components?.changed?.length ?? 0) + (resources?.changed?.length ?? 0) > 0,
        records, ticks: contained?.slots[0].ticks ?? new Float64Array(buffer, block + tickSlot * 8, 2), contained,
        live: false, tick: 0, copied: false, cancels: 0, pending: -1, stopped: false, dropped: false, freed: false,
    };
    target.placed[index] = synced;
    state.synced.count++;
    startCounting(state);
    const keys = keysOf(leaf).map((key): readonly [number, string] => [idOf(state, key), idOfKey(key) ?? ""]);
    target.post({
        protocol: "@adobe/data-ecs/join@1", kind: "synced",
        systems: [{ index, local: proxy?.local ?? null, id: proxy === undefined ? idOfItem(leaf) ?? null : null, keys, block, spare: contained?.slots[1].block ?? null, indexes: named }],
    });
    base.holdings.remote = { unplace: () => stop(state, synced) };
    return { ...base, joined: synced, lastRun: () => synced.lastRun };
};

/** A contained system's posts once the thread runs none of them any more. */
const dropPosts = (synced: JoinedSynced, contained: Contained): void => {
    synced.live = false;
    for (const slot of contained.slots) slot.live = false;
};

/** Frees a stopped system's block and records once the thread dropped it, or left, and no post of it is live. */
const tryFree = (state: State, synced: JoinedSynced): void => {
    const { contained } = synced;
    if (synced.freed || !synced.stopped || synced.live || !(synced.dropped || synced.target.left)) return;
    if (contained !== null && (contained.slots[0].live || contained.slots[1].live)) return;
    synced.freed = true;
    if (contained !== null) {
        state.memory.free(contained.slots[1].block, syncedBlockBytes);
        for (const slot of contained.slots) if (!slot.inline) state.memory.free(slot.snapshot, contained.layout.bytes);
    }
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
    if (synced.contained !== null) Atomics.store(synced.contained.slots[1].control, removedWord, 1);
    state.synced.pending.delete(synced);
    synced.pending = -1;
    state.synced.count--;
    if (state.synced.count === 0 && !state.claimed) state.counting = false;
    if (!synced.target.ended) synced.target.post({ protocol: "@adobe/data-ecs/join@1", kind: "unsynced", indexes: [synced.index] });
    // Posts no sync point settles: released now, but one running, which is once the thread dropped it.
    if (synced.contained !== null) {
        synced.live = false;
        for (const slot of synced.contained.slots) releaseSlot(synced, slot);
    }
    tryFree(state, synced);
};

/** The thread dropped what it held for systems at these indexes. */
export const droppedSynced = (state: State, target: SyncedTarget, indexes: readonly number[]): void => {
    for (const index of indexes) {
        const synced = target.placed[index];
        if (synced === undefined || !synced.stopped) continue;
        synced.dropped = true;
        // Dropped between its posts, the thread runs none of them any more.
        if (synced.contained !== null) dropPosts(synced, synced.contained);
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
        if (synced.contained !== null) dropPosts(synced, synced.contained);
        tryFree(state, synced);
    }
};

/** Whether a resource holds a value, in the resource entity's archetype at its row. */
const holdingIn = (state: State, archetype: Archetype | undefined, row: number, id: number): boolean => {
    // An object here may be a joined thread's own, which only it reads: that thread checks it.
    if (state.layouts[id].kind === "object") return true;
    const storage = archetype?.storageById[id];
    if (storage === undefined) return false;
    const held = readCell(storage, row);
    return held !== null && held !== false;
};

/**
 * Whether a synced system may run after this sync point: its conditions hold, and, with change filters, a resource it
 * filters on changed or a chunk of a component it filters on in an archetype it matches was stamped since it last ran.
 */
const mayRun = (state: State, synced: JoinedSynced): boolean => {
    const { lastRun, conditionIs, conditionNot, resourceChanged } = synced;
    if (conditionIs.length + conditionNot.length + resourceChanged.length > 0) {
        const index = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
        const archetype = index < 0 ? undefined : state.archetypes[state.entities.archetype[index]];
        const row = index < 0 ? 0 : state.entities.row[index];
        for (let k = 0; k < conditionIs.length; k++) if (!holdingIn(state, archetype, row, conditionIs[k])) return false;
        for (let k = 0; k < conditionNot.length; k++) if (holdingIn(state, archetype, row, conditionNot[k])) return false;
        if (!synced.filtered) return true;
        for (let k = 0; k < resourceChanged.length; k++) {
            const storage = archetype?.storageById[resourceChanged[k]];
            if (storage !== undefined && storage.changed[row] > lastRun) return true;
        }
    }
    else if (!synced.filtered) return true;
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
let bytes = new Uint8Array(0);

/** Writes a post into a system's block: its work's end, its filters' `lastRun`, its tick and the run it's for. */
const write = (state: State, synced: JoinedSynced, tick: number): void => {
    if (synced.contained !== null) {
        writeContained(state, synced, synced.contained, tick, headOf(state, synced));
        return;
    }
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
    // Closed first, so no claim reaches it before every word of it is written.
    Atomics.store(control, progressWord, opening);
    for (const word of [doneWord, waitingWord, snapshotOffsetWord, snapshotRowsWord, snapshotStartWord, snapshotFlagsWord, outcomeWord]) Atomics.store(control, word, 0);
    Atomics.store(control, endWord, synced.end);
    Atomics.store(control, runsWord, Math.max(synced.pending, 0));
    Atomics.store(control, syncWord, synced.target.log === null ? 0 : Atomics.load(synced.target.log.header, logSyncWord));
    synced.ticks[0] = tick;
    synced.ticks[1] = synced.lastRun;
    synced.tick = tick;
    synced.copied = false;
    synced.live = true;
    state.synced.posts.push(synced);
    // A thread that sees it sees the rest; then it opens, so a claim of it finds its posted word moved.
    Atomics.add(control, postedWord, 1);
    Atomics.store(control, progressWord, 0);
    synced.target.wake();
};

/**
 * Writes a post of one reading only struct resources into its idle block: its head's flags as of this sync point and its
 * resources' values, so the thread reads only the block, which opens as copied. Touches the block's first and last
 * lines, and its snapshot's line when its flags change or its resources don't fit the last.
 */
const writeContained = (state: State, synced: JoinedSynced, contained: Contained, tick: number, flags: number): void => {
    const slot = contained.slots[contained.current];
    const { control, snapshot } = slot;
    const end = ++slot.end;
    Atomics.store(control, progressWord, opening);
    control[endWord] = end;
    if ((flags & headRan) !== 0 && state.resourceEntity >= 0) {
        const index = indexOf(state.resourceEntity);
        const archetype = state.archetypes[state.entities.archetype[index]];
        const row = state.entities.row[index];
        if (bytes.buffer !== state.memory.memory.buffer) bytes = new Uint8Array(state.memory.memory.buffer);
        for (let k = 0; k < synced.resources.length; k++) {
            const storage = archetype?.storageById[synced.resources[k]];
            if (storage === undefined) continue;
            const stride = synced.resourceStrides[k];
            const from = storage.views.u8;
            const source = row * stride;
            const target = snapshot + contained.layout.resources[k];
            for (let b = 0; b < stride; b++) bytes[target + b] = from[source + b];
        }
    }
    if (flags !== slot.flags) control[snapshotFlagsWord] = flags;
    control[outcomeWord] = notRun;
    control[runsWord] = synced.pending < 0 ? 0 : synced.pending;
    slot.ticks[0] = tick;
    slot.ticks[1] = synced.lastRun;
    slot.tick = tick;
    slot.flags = flags;
    slot.live = true;
    slot.ahead = false;
    synced.tick = tick;
    synced.live = true;
    // As for any post, a thread that sees its posted word sees the rest, and claims it once it's open.
    Atomics.add(control, postedWord, 1);
    Atomics.store(control, progressWord, snapshotted);
    synced.target.wake();
};

/** A contained post's head flags as of this sync point: whether its conditions hold, and its filter passes. */
const headOf = (state: State, synced: JoinedSynced): number => {
    const index = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
    const archetype = index < 0 ? undefined : state.archetypes[state.entities.archetype[index]];
    const row = index < 0 ? 0 : state.entities.row[index];
    for (let k = 0; k < synced.conditionIs.length; k++) if (!holdingIn(state, archetype, row, synced.conditionIs[k])) return 0;
    for (let k = 0; k < synced.conditionNot.length; k++) if (holdingIn(state, archetype, row, synced.conditionNot[k])) return 0;
    if (!synced.filtered) return headPasses;
    for (let k = 0; k < synced.resourceChanged.length; k++) {
        const storage = archetype?.storageById[synced.resourceChanged[k]];
        if (storage !== undefined && storage.changed[row] > synced.lastRun) return headPasses;
    }
    return headExecuted;
};

/** Head flags of a post whose conditions hold and whose filter passes, so its body runs. */
const headPasses = headExecuted | headRan;

/** Takes what the thread did with a contained post, or will do with one it's running: the tick it took, and the run it was for. */
const takeOutcome = (synced: JoinedSynced, slot: Slot, outcome: number): void => {
    if (outcome !== notRun) synced.cancels = 0;
    if (outcome === ranExecuted && slot.tick > synced.lastRun) synced.lastRun = slot.tick;
    if (outcome !== notRun && synced.pending >= 0 && slot.control[runsWord] >= synced.pending) synced.pending = -1;
};

/**
 * Releases a contained post: one no claim reached, cancelled, or one the thread ran, its outcome taken unless it was
 * already. The thread stores what it did as it finishes running, before its done word, and reads nothing of the post
 * after, so a post that says what it did is done. One the thread is running stays live, its outcome taken as its head
 * flags say, which is what the thread does with it: false then.
 */
const releaseSlot = (synced: JoinedSynced, slot: Slot): boolean => {
    if (!slot.live) return true;
    const { control } = slot;
    if (Atomics.compareExchange(control, progressWord, snapshotted, cancelled) === snapshotted) {
        slot.live = false;
        return true;
    }
    const outcome = Atomics.load(control, outcomeWord);
    if (outcome !== notRun || Atomics.load(control, doneWord) >= slot.end) {
        slot.live = false;
        if (!slot.ahead) takeOutcome(synced, slot, outcome);
        return true;
    }
    if (!slot.ahead) {
        slot.ahead = true;
        takeOutcome(synced, slot, (slot.flags & headExecuted) !== 0 ? ranExecuted : ranSkipped);
    }
    return false;
};

/**
 * Before a contained system's next post: releases its live post and readies an idle block, the other one when the
 * thread is running that post; a promise only when both are in use, which the thread's running one post at a time
 * leaves only for a thread that's gone.
 */
const release = (synced: JoinedSynced, contained: Contained): Promise<void> | null => {
    synced.live = false;
    if (releaseSlot(synced, contained.slots[contained.current])) return null;
    contained.current = 1 - contained.current;
    const other = contained.slots[contained.current];
    if (releaseSlot(synced, other)) return null;
    return waitDone({ control: other.control, gone: synced.gone, idle: synced.idle }, other.end).then(() => {
        other.control[waitingWord] = 0;
        releaseSlot(synced, other);
    });
};

const noSynced: readonly JoinedSynced[] = [];

/**
 * After a sync point: posts the synced systems on joined threads among those of the run, `own`, which are owed to run
 * `run` (0 for one of the world's), those added, `added`, that may run, and those still owed to a run. A contained post
 * still live is settled first, waiting only for one in progress. Reads back what the GPU wrote that they read, or
 * their indexes hold by, then refreshes those indexes, first; a promise only when that waits.
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
    let waits: Promise<void>[] | null = null;
    // Contained posts read nothing the GPU writes or an index holds, so with nothing to read back they're written at
    // once, at one tick for the pass, their heads worked out once.
    const { gpu } = state;
    const direct = gpu === null || !gpu.anyAhead();
    let tick = -1;
    for (const synced of pending) {
        const { contained } = synced;
        if (synced.live) {
            if (contained === null) continue;
            const releasing = release(synced, contained);
            // Released, it may have run for the newest run it's owed to.
            if (synced.pending < 0) {
                pending.delete(synced);
                continue;
            }
            if (releasing !== null) {
                waits = gather(waits, releasing);
                (posting ??= []).push(synced);
                continue;
            }
        }
        if (contained !== null && direct) writeContained(state, synced, contained, tick < 0 ? tick = ++state.tick : tick, headOf(state, synced));
        else (posting ??= []).push(synced);
    }
    for (let k = 0; k < added.length; k++) {
        const synced = added[k];
        if (synced.stopped || synced.target.ended || synced.pending >= 0) continue;
        const { contained } = synced;
        if (synced.live) {
            if (contained === null) continue;
            const releasing = release(synced, contained);
            // Its blocks both in use, it's posted once one is idle, if it may run then.
            if (releasing !== null) {
                waits = gather(waits, releasing);
                (posting ??= []).push(synced);
                continue;
            }
        }
        if (contained !== null && direct) {
            const flags = headOf(state, synced);
            if (flags === headPasses) writeContained(state, synced, contained, tick < 0 ? tick = ++state.tick : tick, flags);
        }
        else if (mayRun(state, synced)) (posting ??= []).push(synced);
    }
    if (posting === null) return joinAll(waits);
    const chosen = posting;
    if (waits === null) return readThenPost(state, chosen, pool, false);
    return Promise.all(waits).then(() => readThenPost(state, chosen, pool, true) ?? undefined);
};

/** Posts the chosen ones; `waited`: a contained one waited for is posted only if it may still run. */
const postChosen = (state: State, chosen: readonly JoinedSynced[], waited: boolean): void => {
    const tick = ++state.tick;
    for (let k = 0; k < chosen.length; k++) {
        const synced = chosen[k];
        if (synced.live || synced.stopped || synced.target.ended) continue;
        if (waited && synced.contained !== null && synced.pending < 0 && !mayRun(state, synced)) continue;
        write(state, synced, tick);
    }
};

/**
 * Reads back what the GPU wrote that the chosen posts read, refreshes the indexes they look up through, then posts
 * them: a promise only when that waits.
 */
const readThenPost = (state: State, chosen: readonly JoinedSynced[], pool: Pool | null, waited: boolean): Promise<void> | null => {
    const { gpu } = state;
    // What the GPU wrote is read back first, so the indexes refresh from the values it wrote.
    if (gpu !== null && gpu.anyAhead()) return readAhead(state, gpu, chosen.map(synced => synced.runner)).then(() => refreshThenPost(state, chosen, pool, waited) ?? undefined);
    return refreshThenPost(state, chosen, pool, waited);
};

/** Refreshes the indexes the chosen posts look up through, then posts them: a promise only when refreshing waits. */
const refreshThenPost = (state: State, chosen: readonly JoinedSynced[], pool: Pool | null, waited: boolean): Promise<void> | null => {
    let waiting: Promise<unknown>[] | null = null;
    for (let k = 0; k < chosen.length; k++) {
        const uses = chosen[k].runner.indexes;
        if (uses.length === 0) continue;
        const building = refreshUses(state, uses, pool);
        if (building !== null) (waiting ??= []).push(building);
    }
    if (waiting === null) {
        postChosen(state, chosen, waited);
        return null;
    }
    return Promise.all(waiting).then(() => postChosen(state, chosen, waited));
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
