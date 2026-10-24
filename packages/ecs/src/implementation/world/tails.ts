// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Leaf } from '../../interface/system/leaf.js';
import type { Failure } from '../../interface/report/failure.js';
import { declarationOf, firstKeyOf } from '../../interface/registry/index.js';
import { layoutOf, type Layout } from '../../interface/registry/layout.js';
import { accessOf, type Schedule } from '../../interface/registry/schedule.js';
import { stampChanged, type Archetype } from './archetype.js';
import { readCell } from './cells.js';
import { indexOf, locate } from './entities.js';
import { failureOf } from './failures.js';
import { ownTag } from './move-log.js';
import { forEachPassingRange, type Filter } from './ranges.js';
import { findResource } from './resources.js';
import { liftColumnStamps, type RemoteSystem, type TaskChannel } from './remote-systems.js';
import type { Runner } from './runner.js';
import { idOf, type Key, type State } from './state.js';
import { provenTerminal } from './terminal.js';
import {
    doneWord, endWord, headExecuted, headRan, progressWord, snapshotFlagsWord, snapshotLayout, snapshotOffsetWord, snapshotResourceArchetypeWord,
    snapshotResourceRowWord, snapshotRowsWord, snapshotStartWord, snapshotCapacityWord, snapshotted, tailBlockBytes, tailBlockWords, waitingWord,
} from './tail-blocks.js';

// Tails on the world's thread (threads.md, "Tails"): terminal systems placed on joined threads run after their tick's
// sync point, without the world waiting for them. A later writer of what a tail still reads first copies the rest of
// its reads into a snapshot, and waits for at most the chunk the tail claimed.

const terminalLeaves = new WeakMap<Leaf, boolean>();

const objectsOnly = (keys: readonly Key[] | undefined): boolean =>
    (keys ?? []).every(key => layoutOf(declarationOf(key)?.type).kind === "object");

/**
 * Whether a leaf is terminal: the plugin proved its body never reaches `commands`, and it writes only objects, which
 * live on its own thread, reduces into nothing, and looks nothing up, since a lookup reads the entity table the next
 * sync point rewrites. Neither a kernel nor `up`.
 */
export const isTerminal = (leaf: Leaf): boolean => {
    const known = terminalLeaves.get(leaf);
    if (known !== undefined) return known;
    const { declaration } = leaf;
    const terminal = leaf.kind === "system" && declaration.kernel === undefined && declaration.up === undefined && provenTerminal(leaf.body)
        && Object.keys(declaration.lookup ?? {}).length === 0
        && (declaration.resources?.reduce?.length ?? 0) === 0
        && objectsOnly(declaration.components?.write) && objectsOnly(declaration.resources?.write);
    terminalLeaves.set(leaf, terminal);
    return terminal;
};

const conflicts = (a: Leaf, b: Leaf): boolean => {
    const first = accessOf(a);
    const second = accessOf(b);
    for (const key of first.writes) if (second.writes.has(key) || second.reads.has(key) || second.reduces.has(key)) return true;
    for (const key of second.writes) if (first.reads.has(key) || first.reduces.has(key)) return true;
    return false;
};

/**
 * By tier, whether each leaf runs as a tail where it's placed now: a terminal system on a joined thread that no leaf
 * of a later tier conflicts with, so running it after the sync point changes nothing another system reads.
 */
export const tailsOf = (schedule: Schedule, runnerOf: (leaf: Leaf) => Runner): readonly (readonly boolean[])[] =>
    schedule.tiers.map((tier, t) => tier.map(leaf => {
        if (runnerOf(leaf).remote === null || !isTerminal(leaf)) return false;
        for (let later = t + 1; later < schedule.tiers.length; later++) for (const next of schedule.tiers[later]) if (conflicts(leaf, next)) return false;
        return true;
    }));

/**
 * What a writer copies of a reader that runs after a sync point, as a tail or an observer system on a joined thread
 * does: the archetypes it matches, its reads and filters, its block and its snapshot, and how to tell its thread is
 * gone or idle.
 */
export type Copied = {
    readonly matched: () => readonly Archetype[];
    /** Struct components it reads or filters on, and struct resources it reads, conditions on or filters on. */
    readonly reads: readonly number[];
    readonly resourceReads: readonly number[];
    /**
     * Its linear component reads, in `read` order, and linear resource reads, in its context's order, with strides: a
     * string's are its handles, whose records outlive any snapshot's reader, which is done before the second sync point
     * after the one it reads.
     */
    readonly linear: readonly number[];
    readonly strides: readonly number[];
    readonly resources: readonly number[];
    readonly resourceStrides: readonly number[];
    /** The objects it writes, components and resources, whose tags turn its own once it reads from a snapshot. */
    readonly writes: readonly number[];
    readonly resourceObjectWrites: readonly number[];
    readonly added: readonly number[];
    readonly changed: readonly number[];
    readonly resourceChanged: readonly number[];
    readonly conditionIs: readonly number[];
    readonly conditionNot: readonly number[];
    readonly query: boolean;
    readonly block: number;
    readonly control: Int32Array;
    snapshot: { offset: number; bytes: number } | null;
    /** As posted: its work's end, 1 plus its rows, and its `lastRun`. */
    end: number;
    lastRun: number;
    /** Whether its thread is gone, and what resolves once its thread has no task in flight or is gone. */
    readonly gone: () => boolean;
    readonly idle: () => Promise<unknown>;
};

/** A system's run as a tail: what it reads and writes, its block, its snapshot, and its task in flight. */
export type Tail = Copied & {
    readonly remote: RemoteSystem;
    readonly runner: Runner;
    /** Whether a writer must still copy what it reads. */
    unresolved: boolean;
};

/** The reads of `ids` in linear memory, a string's handles included, with their strides. */
export const linearOf = (state: State, ids: readonly number[]): { readonly ids: readonly number[]; readonly strides: readonly number[] } => {
    const linear: number[] = [];
    const strides: number[] = [];
    for (const id of ids) {
        const layout: Layout = state.layouts[id];
        if (layout.kind !== "linear" && layout.kind !== "string") continue;
        linear.push(id);
        strides.push(layout.stride);
    }
    return { ids: linear, strides };
};

const isStruct = (state: State, id: number): boolean => state.layouts[id].kind !== "object";

/** A runner's tail, made the first time it runs as one; its block is the channel's, freed with it. */
export const tailOf = (state: State, runner: Runner, leaf: Leaf): Tail => {
    const remote = runner.remote;
    if (remote === null) throw new Error(`System "${leaf.name}" runs as a tail only on a joined thread.`);
    if (remote.tail !== null) return remote.tail;
    const { components, resources } = leaf.declaration;
    const ids = (keys: readonly Key[] | undefined): number[] => [...new Set((keys ?? []).map(key => idOf(state, key)))];
    const reads = ids([...components?.read ?? [], ...components?.added ?? [], ...components?.changed ?? []]).filter(id => isStruct(state, id));
    const writes = new Set<Key>(resources?.write);
    const contextKeys = [...new Set<Key>([...resources?.read ?? [], ...resources?.is ?? [], ...writes].map(firstKeyOf))];
    const resourceReads = ids([...resources?.read ?? [], ...resources?.is ?? [], ...resources?.not ?? [], ...resources?.changed ?? []]).filter(id => isStruct(state, id));
    const linear = linearOf(state, ids(components?.read));
    const linearResources = linearOf(state, contextKeys.filter(key => !writes.has(key)).map(key => idOf(state, key)));
    const block = state.memory.allocate(tailBlockBytes);
    const control = new Int32Array(state.memory.memory.buffer, block, tailBlockWords).fill(0);
    const { channel } = remote;
    const tail: Tail = {
        remote, runner, reads, resourceReads, matched: runner.matched, gone: channel.gone, idle: () => channel.idle(),
        linear: linear.ids, strides: linear.strides, resources: linearResources.ids, resourceStrides: linearResources.strides,
        writes: ids(components?.write), resourceObjectWrites: ids(resources?.write),
        added: ids(components?.added), changed: ids(components?.changed), resourceChanged: ids(resources?.changed),
        conditionIs: ids(resources?.is), conditionNot: ids(resources?.not),
        query: components !== undefined, block, control, snapshot: null, end: 0, lastRun: 0, unresolved: false,
    };
    remote.tail = tail;
    remote.channel.owned.push(tail);
    return tail;
};

/** Frees a channel's tails' blocks and snapshots, once its thread left. */
export const freeTail = (state: State, tail: Tail): void => {
    state.memory.free(tail.block, tailBlockBytes);
    if (tail.snapshot !== null) state.memory.free(tail.snapshot.offset, tail.snapshot.bytes);
    tail.snapshot = null;
};

/** What a schedule's tails gave back once their tasks settled: failures and skipped systems, null for none. */
export type TailOutcome = { readonly failures: Failure[] | null; readonly skipped: string[] | null };

const settledTail = (state: State, tail: Tail): void => {
    tail.unresolved = false;
    const at = state.tails.indexOf(tail);
    if (at >= 0) state.tails.splice(at, 1);
};

/** Readies a tail's block for its task: its end, from the rows its query matches now, and its `lastRun`. */
const prepare = (state: State, tail: Tail): void => {
    const { control, runner } = tail;
    let rows = 0;
    if (tail.query) for (const archetype of runner.matched()) rows += archetype.count;
    tail.end = 1 + rows;
    tail.lastRun = tail.remote.lastRun;
    for (const word of [progressWord, doneWord, waitingWord, snapshotOffsetWord, snapshotRowsWord, snapshotStartWord, snapshotFlagsWord]) Atomics.store(control, word, 0);
    Atomics.store(control, endWord, tail.end);
    liftColumnStamps(runner);
    tail.unresolved = true;
    state.tails.push(tail);
};

/**
 * After a sync point: posts the tails of `runners`, those of each channel as one task in schedule order. Each channel
 * must have no task in flight. Resolves with their outcome once every task settled. A tail removed since `runners` were
 * read, by a body that ran while the caller waited for its channel, is in no task: its thread drops it once the tasks
 * posted before its removal are done.
 */
export const postTails = (state: State, runners: readonly Runner[], leaves: readonly Leaf[], tiers: readonly number[], args: unknown): Promise<TailOutcome> => {
    const channels: TaskChannel[] = [];
    for (const runner of runners) if (runner.remote !== null && !runner.holdings.removed && !channels.includes(runner.remote.channel)) channels.push(runner.remote.channel);
    const tasks = channels.map(channel => {
        const systems: RemoteSystem[] = [];
        const order: number[] = [];
        const tails: Tail[] = [];
        for (let k = 0; k < runners.length; k++) {
            const remote = runners[k].remote;
            if (remote === null || remote.channel !== channel || runners[k].holdings.removed) continue;
            const tail = tailOf(state, runners[k], leaves[k]);
            prepare(state, tail);
            systems.push(remote);
            order.push(tiers[k]);
            tails.push(tail);
        }
        return channel.run(state, systems, order, args, true).then(done => {
            for (const tail of tails) settledTail(state, tail);
            return { done, systems };
        });
    });
    return outcomeOf(tasks);
};

const outcomeOf = async (tasks: readonly Promise<{ readonly done: boolean; readonly systems: readonly RemoteSystem[] }>[]): Promise<TailOutcome> => {
    let failures: Failure[] | null = null;
    let skipped: string[] | null = null;
    for (const { done, systems } of await Promise.all(tasks)) {
        for (const system of systems) {
            if (!done) {
                (failures ??= []).push(failureOf("thread", { name: system.label, id: system.id }, system.channel.goneError()));
                (skipped ??= []).push(system.label);
            }
            else if (system.result.error !== undefined) (failures ??= []).push(failureOf("system", { name: system.label, id: system.id }, system.result.error));
        }
    }
    return { failures, skipped };
};

/**
 * For benchmarks and tests: `wait`, a writer of what a tail still reads waits until the tail is done instead of copying
 * the rest, the alternative `tail overlap waiting` measures snapshots against; and `copies`, the copies writers took,
 * which tests wait for to order a thread's reads after one.
 */
export const tailWriters = { wait: false, copies: 0 };

/** How long the world spins for a tail's chunk before it waits: about one wake-up's latency. */
const spinMilliseconds = 0.02;

/** Waits until the tail read through `target`, or its thread is gone. */
export const waitDone = async (tail: Pick<Copied, "control" | "gone" | "idle">, target: number): Promise<void> => {
    const { control } = tail;
    const deadline = performance.now() + spinMilliseconds;
    while (Atomics.load(control, doneWord) < target && performance.now() < deadline);
    if (Atomics.load(control, doneWord) >= target) return;
    Atomics.store(control, waitingWord, 1);
    for (let current = Atomics.load(control, doneWord); current < target && !tail.gone(); current = Atomics.load(control, doneWord)) {
        if (typeof Atomics.waitAsync !== "function") {
            await Promise.race([new Promise(resolve => setTimeout(resolve, 0)), tail.idle()]);
            continue;
        }
        const waited = Atomics.waitAsync(control, doneWord, current);
        if (waited.async) await Promise.race([waited.value, tail.idle()]);
    }
};

/** Runs of consecutive passing rows a snapshot copies, reused: archetype id, first row, end, and position of the first. */
const runs: number[] = [];

const holding = (state: State, id: number): boolean => {
    const cell = findResource(state, state.keys[id]);
    if (cell === undefined) return false;
    const held = readCell(cell.storage, cell.row);
    return held !== null && held !== false;
};

/** Its head as the tail evaluates it: whether its conditions hold, and from which tick rows pass, -1 for every row. */
const headOf = (state: State, tail: Copied): { readonly executed: boolean; readonly ran: boolean; readonly since: number } => {
    if (!tail.conditionIs.every(id => holding(state, id)) || tail.conditionNot.some(id => holding(state, id))) return { executed: false, ran: false, since: 0 };
    let resourcesChanged = false;
    for (const id of tail.resourceChanged) {
        const cell = findResource(state, state.keys[id]);
        if (cell !== undefined && cell.storage.changed[cell.row] > tail.lastRun) resourcesChanged = true;
    }
    const filtered = tail.added.length + tail.changed.length + tail.resourceChanged.length > 0;
    const since = !filtered || resourcesChanged ? -1 : tail.lastRun;
    if (!tail.query) return { executed: true, ran: since < 0, since };
    if (since >= 0 && tail.added.length + tail.changed.length === 0) return { executed: true, ran: false, since };
    return { executed: true, ran: true, since };
};

const filtersOf = (tail: Copied, archetype: Archetype): Filter[] => {
    const filters: Filter[] = [];
    for (const id of tail.added) {
        const storage = archetype.storageById[id];
        if (storage !== undefined) filters.push({ ticks: storage.added, chunks: storage.chunkAdded, blocks: storage.blockAdded });
    }
    for (const id of tail.changed) {
        const storage = archetype.storageById[id];
        if (storage !== undefined) filters.push({ ticks: storage.changed, chunks: storage.chunkChanged, blocks: storage.blockChanged });
    }
    return filters;
};

/**
 * Copies the tail's reads from position `from` on: its head's flags and resources, and each passing row's position,
 * archetype, row and entity with its linear reads, a run of rows at a time, into a snapshot laid out for as many rows
 * as it could hold.
 */
const writeSnapshot = (state: State, tail: Copied, from: number): void => {
    const { control } = tail;
    const head = headOf(state, tail);
    runs.length = 0;
    let rows = 0;
    if (tail.query && head.ran) {
        const matched = tail.matched();
        let base = 1;
        for (let m = 0; m < matched.length; m++) {
            const archetype = matched[m];
            const { count } = archetype;
            const first = Math.max(0, from - base);
            if (first < count) {
                const position = base;
                forEachPassingRange(filtersOf(tail, archetype), head.since, first, count, (begin, end) => {
                    runs.push(archetype.id, begin, end, position + begin);
                    rows += end - begin;
                });
            }
            base += count;
        }
    }
    const capacity = Math.max(rows, 1);
    const layout = snapshotLayout(capacity, tail.strides, tail.resourceStrides);
    if (tail.snapshot === null || tail.snapshot.bytes < layout.bytes) {
        if (tail.snapshot !== null) state.memory.free(tail.snapshot.offset, tail.snapshot.bytes);
        const bytes = Math.max(layout.bytes, 2 * (tail.snapshot?.bytes ?? 0), 256);
        tail.snapshot = { offset: state.memory.allocate(bytes), bytes };
    }
    const { offset } = tail.snapshot;
    const buffer = state.memory.memory.buffer;
    const u8 = new Uint8Array(buffer);
    const u32 = new Uint32Array(buffer);
    const f64 = new Float64Array(buffer, 0, buffer.byteLength >> 3);
    const positions = (offset + layout.positions) >> 2;
    const archetypes = (offset + layout.archetypes) >> 2;
    const rowWords = (offset + layout.rows) >> 2;
    const entities = (offset + layout.entities) >> 3;
    let at = 0;
    for (let r = 0; r < runs.length; r += 4) {
        const archetype = state.archetypes[runs[r]];
        const begin = runs[r + 1];
        const end = runs[r + 2];
        const position = runs[r + 3];
        for (let row = begin, i = at; row < end; row++, i++) {
            u32[positions + i] = position + row - begin;
            u32[archetypes + i] = archetype.id;
            u32[rowWords + i] = row;
        }
        f64.set(archetype.entities.subarray(begin, end), entities + at);
        for (let k = 0; k < tail.linear.length; k++) {
            const views = archetype.storageById[tail.linear[k]]?.views;
            const stride = tail.strides[k];
            if (views !== undefined) u8.set(views.u8.subarray(begin * stride, end * stride), offset + layout.columns[k] + at * stride);
        }
        at += end - begin;
    }
    for (let k = 0; k < tail.resources.length; k++) {
        const cell = findResource(state, state.keys[tail.resources[k]]);
        const stride = tail.resourceStrides[k];
        if (cell !== undefined) u8.set(cell.storage.views.u8.subarray(cell.row * stride, (cell.row + 1) * stride), offset + layout.resources[k]);
    }
    const resourceIndex = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
    Atomics.store(control, snapshotResourceArchetypeWord, resourceIndex < 0 ? -1 : state.entities.archetype[resourceIndex]);
    Atomics.store(control, snapshotResourceRowWord, resourceIndex < 0 ? 0 : state.entities.row[resourceIndex]);
    Atomics.store(control, snapshotOffsetWord, offset);
    Atomics.store(control, snapshotCapacityWord, capacity);
    Atomics.store(control, snapshotRowsWord, rows);
    Atomics.store(control, snapshotStartWord, from);
    Atomics.store(control, snapshotFlagsWord, (head.executed ? headExecuted : 0) | (head.ran ? headRan : 0));
};

/**
 * The objects a tail writes in rows it reads from the snapshot, from position `claimed` on, become its own value in
 * their tags, which the thread holds, so the sync point moves and finalizes them as such.
 */
const markOwn = (state: State, tail: Copied, claimed: number): void => {
    if (tail.writes.length > 0) for (let r = 0; r < runs.length; r += 4) {
        const archetype = state.archetypes[runs[r]];
        const begin = Math.max(runs[r + 1], runs[r + 1] + claimed - runs[r + 3]);
        const end = runs[r + 2];
        for (const id of tail.writes) {
            const storage = archetype.storageById[id];
            if (storage === undefined || storage.tags.length === 0) continue;
            for (let row = begin; row < end; row++) storage.tags[row] = ownTag;
        }
    }
    if (tail.resourceObjectWrites.length === 0 || state.resourceEntity < 0) return;
    const index = indexOf(state.resourceEntity);
    const archetype = state.archetypes[state.entities.archetype[index]];
    for (const id of tail.resourceObjectWrites) {
        const storage = archetype?.storageById[id];
        if (storage !== undefined && storage.tags.length > 0) storage.tags[state.entities.row[index]] = ownTag;
    }
};

/**
 * Before a writer of what a tail reads: unless it read everything, copies the rest from the position it reached,
 * adds `snapshotted` to its progress, and waits for the chunk it claimed. Null when nothing is left to wait for.
 */
const resolve = (state: State, tail: Tail): Promise<void> | null => {
    settledTail(state, tail);
    return copyRest(state, tail);
};

/**
 * Unless the reader read everything, copies the rest of what it reads from the position it reached, adds `snapshotted`
 * to its progress, and waits for the chunk it claimed. Null when nothing is left to wait for.
 */
export const copyRest = (state: State, tail: Copied): Promise<void> | null => {
    const { control, end } = tail;
    if (Atomics.load(control, doneWord) >= end) return null;
    if (tailWriters.wait) return waitDone(tail, end);
    const from = Atomics.load(control, progressWord);
    runs.length = 0;
    if (from < end) writeSnapshot(state, tail, from);
    // Added rather than exchanged, so a claim before the copy stays in the word: a post a claim reached is never taken
    // for one none did (`cancel` in joined-observer.ts). Claims past it, a chunk at a time, keep the word below
    // `cancelled` there, `snapshotted` plus at most the end and a chunk, as ends are far below their difference.
    const claimed = Atomics.add(control, progressWord, snapshotted);
    tailWriters.copies++;
    // Rows the tail claimed while this copied it reads where they are.
    if (claimed < end) markOwn(state, tail, claimed);
    const target = Math.min(claimed, end);
    if (target === 0 || Atomics.load(control, doneWord) >= target) return null;
    return waitDone(tail, target);
};

const any = (ids: readonly number[], among: readonly number[]): boolean => {
    for (let i = 0; i < ids.length; i++) if (among.includes(ids[i])) return true;
    return false;
};

const settleEach = (state: State, conflicting: (tail: Tail) => boolean): Promise<void> | null => {
    let waits: Promise<void>[] | null = null;
    for (const tail of [...state.tails]) {
        if (!tail.unresolved || !conflicting(tail)) continue;
        const waiting = resolve(state, tail);
        if (waiting !== null) (waits ??= []).push(waiting);
    }
    return waits === null ? null : waits.length === 1 ? waits[0] : Promise.all(waits).then(() => undefined);
};

/** Before runners that write components or resources: resolves each tail reading one. Null when none waits. */
export const settleRunners = (state: State, runners: readonly Runner[]): Promise<void> | null => settleEach(state, tail => {
    for (const runner of runners) {
        if (runner.remote !== null && runner.remote.tail === tail) continue;
        if (any(runner.writes, tail.reads) || any(runner.resourceWrites, tail.resourceReads)) return true;
    }
    return false;
});

/** Before the world writes these components or resources itself, as GPU readbacks and the clock do. */
export const settleKeys = (state: State, components: readonly number[], resources: readonly number[]): Promise<void> | null =>
    settleEach(state, tail => any(components, tail.reads) || any(resources, tail.resourceReads));

/**
 * Whether a tail reads the world's memory: rows, or struct resources. One that doesn't, reading only its own thread's
 * objects, has nothing a sync point writes, so its sync points don't wait for its body.
 */
const readsMemory = (tail: Tail): boolean => tail.query || tail.resourceReads.length > 0;

/** Before a sync point applies: it counts as a write to everything a tail reads, since growth frees blocks it may reuse. */
export const settleAll = (state: State): Promise<void> | null => settleEach(state, readsMemory);

/**
 * Stamps the objects a tail wrote from its snapshot, as the thread names them by entity and component, changed at its
 * tick where the entity is now; one despawned since has nothing to stamp.
 */
export const stampWritten = (state: State, stamps: readonly number[], position: number, tick: number): void => {
    for (let k = 0; k < stamps.length; k += 3) {
        if (stamps[k] !== position) continue;
        const index = locate(state.entities, stamps[k + 1]);
        if (index < 0) continue;
        const storage = state.archetypes[state.entities.archetype[index]]?.storageById[stamps[k + 2]];
        if (storage !== undefined) stampChanged(storage, state.entities.row[index], tick);
    }
};
