import type { Leaf } from '../../interface/system/leaf.js';
import type { Leaf as FinalizerLeaf } from '../../interface/finalizer/created.js';
import type { Report } from '../../interface/world/report.js';
import { idOfItem, idOfKey, labelOf, labelOfItem, threadOf } from '../../interface/registry/index.js';
import type { Archetype } from './archetype.js';
import { chunkShift } from './kernel.js';
import type { LocalIds, Segment } from './command-ring.js';
import type { ToJoined } from './joining.js';
import { lineWords, type WorkerError } from './protocol.js';
import { reductionTargets, type ReductionTarget } from './reductions.js';
import { resourceWritesOf, type Runner } from './runner.js';
import { idOf, type Key, type State } from './state.js';
import { logBoundedWord, logBoundWord, logSyncWord, type MoveLog } from './move-log.js';
import { createStopWriter, freeStops, type StopWriter } from './stop-lists.js';
import { freeTail, stampWritten, type Tail } from './tails.js';
import { isHeld } from './transfers.js';
import {
    completionCapacityWord, completionMessage, completionOffsetWord, completionSystems, completionWords, executedFlag, failedFlag,
    payloadCapacityWord, payloadCount, payloadInput, payloadOffsetWord, payloadSequence, payloadSync, payloadSystems, payloadWords, ranFlag,
    resultEnd, resultFields, resultFlags, resultStart, ringBaseWord, ringCapacityWord, ringCursorWord, ringNeededWord, spilledFlag, systemFields,
    systemFolds, systemIndex, systemLastRun, systemTail, systemTick, systemTier, taskBlockWords, taskDoneWord, taskPostedWord,
} from './thread-tasks.js';

// The world's side of systems on joined threads (threads.md, "Systems on other threads"): a runner standing for each
// system placed on a thread a joined thread fills, and that thread's task block and command ring, through which a
// tier, or consecutive tiers all on that thread, run as one task.

/** What a task of a joined thread's gave back for one of its systems. */
export type RemoteResult = {
    flags: number;
    segment: Segment | undefined;
    error: unknown;
};

/** A system placed on a joined thread: its channel, its index there, and what its last task gave back. */
export type RemoteSystem = {
    readonly channel: TaskChannel;
    readonly index: number;
    readonly label: string;
    /** Its warning, listed in each run's report its tier blocks. */
    readonly warning: Report["warnings"][number];
    readonly targets: readonly ReductionTarget[];
    /** Its folds' leaves, as the last task gave them, by target. */
    readonly folds: readonly Float64Array[];
    /** Where its folds start among a task's. */
    readonly foldCount: number;
    /** Components it filters on with `changed`, whose GPU column stamps reach the thread as row ticks. */
    readonly changed: readonly number[];
    readonly declaresInput: boolean;
    lastRun: number;
    readonly result: RemoteResult;
    /** Its block and snapshot once it ran as a tail (`tails.ts`). */
    tail: Tail | null;
};

/** The world's end of a joined thread's task block and command ring. */
export type TaskChannel = {
    /** The joined thread's number, its log's. */
    readonly log: MoveLog;
    /** The byte offset of its task block, which the thread is posted. */
    readonly block: number;
    /** The thread's own numbers for keys, as the world's ids, for its segments. */
    readonly local: LocalIds;
    /** Whether it's gone, so its systems are skipped with a `"thread"` failure. */
    readonly gone: () => boolean;
    /** Why its systems are skipped once it's gone. */
    readonly goneError: () => Error;
    /**
     * Runs `systems`, with the tier of each within the task, as one task: each takes the next tick, and its result is
     * in its `result` once this resolves. Resolves with false when the thread is gone, having given back nothing.
     */
    readonly run: (state: State, systems: readonly RemoteSystem[], tiers: readonly number[], args: unknown, tails?: boolean) => Promise<boolean>;
    /** Resolves once no task is in flight, as a tail may be: true once done, false once the thread is gone. */
    readonly idle: () => Promise<boolean>;
    /** Whether a task is in flight. */
    readonly busy: () => boolean;
    /** Tails of its systems, whose blocks are freed with it. */
    readonly owned: Tail[];
    /** A task's message, when its completion says one follows. */
    readonly completed: (message: Extract<import('./joining.js').ToWorld, { kind: "completed" }>) => void;
    /** Places a system on the thread, posting its setup; returns its index there. */
    readonly place: (state: State, leaf: Leaf) => number;
    /** Places a finalizer on the thread, posting its setup; returns its index there. Throws for one the thread can't name. */
    readonly placeFinalizer: (state: State, finalizer: FinalizerLeaf) => number;
    /** The finalizer placed at an index there, for its failures there. */
    readonly finalizerAt: (index: number) => FinalizerLeaf | undefined;
    /** Its finalizers' stop lists. */
    readonly stops: StopWriter;
    /** Whether a command giving one of its staged `transfer` values dropped this sync point, so it's woken to release it. */
    dropped: boolean;
    /** Wakes the thread, so it runs its finalizers for the stops just published. */
    readonly wake: () => void;
    /** At a sync point, once segments are drained and no task runs: empties the ring, growing it to what tasks needed. */
    readonly rewind: () => void;
    /** Once the thread is gone: settles a task in flight, which gives back nothing. */
    readonly end: () => void;
    /** Frees its blocks once the thread left, as a thread that died may still be writing them. */
    readonly free: () => void;
};

/** How long the world spins for a task before it waits: about one wake-up's latency. */
const spinMilliseconds = 0.02;

/** A command ring's first size in bytes; a sync point grows it to what a task's systems needed. */
const initialRingBytes = 1 << 16;

type Block = { offset: number; bytes: number };

const errorOf = ({ name, message, stack }: WorkerError): Error => Object.assign(new Error(message), { name, stack });

/**
 * A joined thread's task block, in the memory, with its command ring: `post` reaches the thread and `wake` wakes it;
 * where `Atomics.waitAsync` can't wait here, the thread's `completed` message says a task is done. `label` names the
 * threads it claims; `local` maps its own numbers for keys.
 */
export const createTaskChannel = (state: State, log: MoveLog, post: (message: ToJoined) => void, wake: () => void, label: string, local: LocalIds): TaskChannel => {
    const { memory: arena } = state;
    const lineBytes = lineWords * 4;
    const blockBytes = taskBlockWords * 4 + lineBytes;
    const raw = arena.allocate(blockBytes);
    const start = Math.ceil(raw / lineBytes) * lineBytes;
    const control = new Int32Array(arena.memory.buffer, start, taskBlockWords).fill(0);
    let ring: Block = { offset: arena.allocate(initialRingBytes), bytes: initialRingBytes };
    let payload: Block = { offset: 0, bytes: 0 };
    let completion: Block = { offset: 0, bytes: 0 };
    let payloadView = new Float64Array(0);
    let completionView = new Float64Array(0);
    const placeRing = (): void => {
        Atomics.store(control, ringBaseWord, ring.offset);
        Atomics.store(control, ringCapacityWord, ring.bytes);
        Atomics.store(control, ringCursorWord, 0);
        Atomics.store(control, ringNeededWord, 0);
    };
    placeRing();
    let sequence = 0;
    let ended = false;
    /** Settles the task in flight: true once done, false once the thread is gone. */
    let settle: ((done: boolean) => void) | null = null;
    let message: Extract<import('./joining.js').ToWorld, { kind: "completed" }> | null = null;
    let wrote = false;
    let placed = 0;
    const goneError = (): Error => new Error(`Thread "${label}" is gone, so its systems don't run.`);

    /** Grows a block of f64 words, while no task runs. */
    const ensure = (block: Block, words: number): Block => {
        if (block.bytes >= words * 8) return block;
        if (block.bytes > 0) arena.free(block.offset, block.bytes);
        const bytes = Math.max(words * 8, 2 * block.bytes, 256);
        return { offset: arena.allocate(bytes), bytes };
    };

    const views = (): void => {
        const { buffer } = arena.memory;
        if (payloadView.buffer !== buffer || payloadView.byteOffset !== payload.offset || payloadView.byteLength !== payload.bytes) payloadView = new Float64Array(buffer, payload.offset, payload.bytes / 8);
        if (completionView.buffer !== buffer || completionView.byteOffset !== completion.offset || completionView.byteLength !== completion.bytes) completionView = new Float64Array(buffer, completion.offset, completion.bytes / 8);
    };

    /** Reads back each system's flags, segment and folds once the task is done and its message, if any, arrived. */
    const collect = (systems: readonly RemoteSystem[]): void => {
        views();
        const folds = completionSystems + systems.length * resultFields;
        const { buffer } = arena.memory;
        for (let k = 0; k < systems.length; k++) {
            const system = systems[k];
            const at = completionSystems + k * resultFields;
            const flags = completionView[at + resultFlags];
            const { result } = system;
            result.flags = flags;
            result.error = undefined;
            result.segment = undefined;
            const startByte = completionView[at + resultStart];
            const endByte = completionView[at + resultEnd];
            if ((flags & spilledFlag) !== 0) {
                const spill = message?.spills.find(([position]) => position === k)?.[1];
                if (spill !== undefined) result.segment = { bytes: spill, tag: { tick: payloadView[payloadSystems + k * systemFields + systemTick], archetype: 0, start: k } };
                wrote = true;
            }
            else if (endByte > startByte) {
                result.segment = { bytes: new Uint8Array(buffer, ring.offset + startByte, endByte - startByte), tag: { tick: payloadView[payloadSystems + k * systemFields + systemTick], archetype: 0, start: k } };
                wrote = true;
            }
            if ((flags & failedFlag) !== 0) {
                const failure = message?.errors.find(([position]) => position === k)?.[1];
                result.error = failure === undefined ? new Error(`System "${system.label}" failed on thread "${label}".`) : errorOf(failure);
            }
            if ((flags & executedFlag) !== 0) system.lastRun = payloadView[payloadSystems + k * systemFields + systemTick];
            const stamps = message?.stamps;
            if (stamps !== undefined && stamps.length > 0) stampWritten(state, stamps, k, payloadView[payloadSystems + k * systemFields + systemTick]);
            if ((flags & ranFlag) !== 0 && (flags & failedFlag) === 0) {
                let offset = folds + payloadView[payloadSystems + k * systemFields + systemFolds];
                for (const leaves of system.folds) for (let i = 0; i < leaves.length; i++) leaves[i] = completionView[offset++];
            }
        }
    };

    /** Settles a wait for the task in flight once the thread stored it done. */
    const doneNow = (): void => {
        const resolve = settle;
        settle = null;
        resolve?.(true);
    };
    /** Waits without blocking for the done word to move past `current`, or for the thread's message, or its end. */
    const changed = (current: number): Promise<boolean> => new Promise<boolean>(resolve => {
        settle = resolve;
        if (typeof Atomics.waitAsync !== "function") return;
        const waited = Atomics.waitAsync(control, taskDoneWord, current);
        if (waited.async) void waited.value.then(doneNow);
        else doneNow();
    });

    /**
     * Resolves once the thread stored task `expected` done, and its message arrived when one follows, or once it's
     * gone. Spins briefly first: a short task finishes before a wait's wake-up would arrive.
     */
    const whenDone = async (expected: number): Promise<boolean> => {
        const deadline = performance.now() + spinMilliseconds;
        while (Atomics.load(control, taskDoneWord) < expected && performance.now() < deadline);
        for (let current = Atomics.load(control, taskDoneWord); current < expected; current = Atomics.load(control, taskDoneWord)) {
            if (ended || !await changed(current)) return false;
        }
        if (completionView[completionMessage] !== 0 && (message === null || message.sequence !== expected)) {
            const arrived = new Promise<boolean>(resolve => { settle = resolve; });
            if (!await arrived) return false;
        }
        return true;
    };

    /** The systems of the task in flight, kept as posted: the caller reuses what it passed. */
    const flight: RemoteSystem[] = [];
    let flying: Promise<boolean> | null = null;
    const settledTask = Promise.resolve(true);
    const notRun = Promise.resolve(false);
    const run = (state: State, systems: readonly RemoteSystem[], tiers: readonly number[], args: unknown, tails = false): Promise<boolean> => {
        if (ended) return notRun;
        const task = runTask(state, systems, tiers, args, tails);
        flying = task;
        return task;
    };
    const runTask = async (state: State, systems: readonly RemoteSystem[], tiers: readonly number[], args: unknown, tails: boolean): Promise<boolean> => {
        if (ended) return false;
        flight.length = 0;
        for (let k = 0; k < systems.length; k++) flight.push(systems[k]);
        let leaves = 0;
        for (const system of systems) leaves += system.foldCount;
        payload = ensure(payload, payloadWords(systems.length));
        completion = ensure(completion, completionWords(systems.length, leaves));
        Atomics.store(control, payloadOffsetWord, payload.offset);
        Atomics.store(control, payloadCapacityWord, payload.bytes);
        Atomics.store(control, completionOffsetWord, completion.offset);
        Atomics.store(control, completionCapacityWord, completion.bytes);
        views();
        const next = ++sequence;
        message = null;
        payloadView[payloadSequence] = next;
        payloadView[payloadSync] = Atomics.load(log.header, logSyncWord) >>> 0;
        payloadView[payloadCount] = systems.length;
        const input = args !== undefined && systems.some(system => system.declaresInput);
        payloadView[payloadInput] = input ? 1 : 0;
        let folds = 0;
        for (let k = 0; k < systems.length; k++) {
            const system = systems[k];
            const base = payloadSystems + k * systemFields;
            payloadView[base + systemIndex] = system.index;
            payloadView[base + systemTick] = ++state.tick;
            payloadView[base + systemLastRun] = system.lastRun;
            payloadView[base + systemTier] = tiers[k];
            payloadView[base + systemFolds] = folds;
            payloadView[base + systemTail] = tails ? system.tail?.block ?? 0 : 0;
            folds += system.foldCount;
        }
        // An input that moved to the thread is there already: the message names it.
        if (input) post(isHeld(args)
            ? { protocol: "@adobe/data-ecs/join@1", kind: "task input", sequence: next, input: undefined, held: [args.from, args.sequence] }
            : { protocol: "@adobe/data-ecs/join@1", kind: "task input", sequence: next, input: args });
        completionView[completionMessage] = 0;
        if (tails) {
            Atomics.store(log.header, logBoundWord, payloadView[payloadSync]);
            Atomics.store(log.header, logBoundedWord, 1);
        }
        Atomics.store(control, taskPostedWord, next);
        wake();
        const done = await whenDone(next);
        if (tails) Atomics.store(log.header, logBoundedWord, 0);
        if (done) collect(flight);
        flying = null;
        return done;
    };

    /** An item's setup there: its id, and the world's numbers for the keys it names, by their ids. Throws without them. */
    const setupOf = (state: State, item: Leaf | FinalizerLeaf, what: string, named: readonly symbol[]): { readonly id: string; readonly keys: readonly (readonly [number, string])[] } => {
        const id = idOfItem(item);
        if (id === undefined) throw new Error(`${what} "${labelOfItem(item)}" runs on thread "${label}", which a joined thread fills, and has no id, so that thread can't name it; the build gives top-level ${what === "System" ? "systems" : "finalizers"} one.`);
        const keys: (readonly [number, string])[] = [];
        for (const key of named) {
            const keyId = idOfKey(key);
            if (keyId === undefined) throw new Error(`${what} "${labelOfItem(item)}" names "${labelOf(key)}", which has no id, so thread "${label}" can't name it; the build gives top-level keys one.`);
            keys.push([idOf(state, key), keyId]);
        }
        return { id, keys };
    };

    const place = (state: State, leaf: Leaf): number => {
        const { id, keys } = setupOf(state, leaf, "System", keysOf(leaf));
        const index = placed++;
        post({ protocol: "@adobe/data-ecs/join@1", kind: "systems", systems: [{ index, id, keys }] });
        return index;
    };

    const finalizers: FinalizerLeaf[] = [];
    const placeFinalizer = (state: State, finalizer: FinalizerLeaf): number => {
        const { id, keys } = setupOf(state, finalizer, "Finalizer", finalizerKeysOf(finalizer));
        const index = finalizers.push(finalizer) - 1;
        post({ protocol: "@adobe/data-ecs/join@1", kind: "finalizers", finalizers: [{ index, id, keys }] });
        return index;
    };
    const stops = createStopWriter(arena, log);
    const owned: Tail[] = [];

    return {
        log,
        block: start,
        local,
        gone: () => ended,
        goneError,
        run,
        idle: () => flying ?? settledTask,
        busy: () => flying !== null,
        owned,
        completed: arrived => {
            message = arrived;
            const resolve = settle;
            settle = null;
            resolve?.(true);
        },
        place,
        placeFinalizer,
        finalizerAt: index => finalizers[index],
        stops,
        dropped: false,
        wake,
        rewind: () => {
            if (!wrote || ended) return;
            wrote = false;
            const needed = Atomics.load(control, ringNeededWord);
            if (needed > ring.bytes) {
                arena.free(ring.offset, ring.bytes);
                const bytes = Math.max(needed, 2 * ring.bytes);
                ring = { offset: arena.allocate(bytes), bytes };
            }
            placeRing();
        },
        end: () => {
            ended = true;
            const resolve = settle;
            settle = null;
            resolve?.(false);
        },
        free: () => {
            freeStops(stops);
            for (const tail of owned) freeTail(state, tail);
            arena.free(raw, blockBytes);
            arena.free(ring.offset, ring.bytes);
            if (payload.bytes > 0) arena.free(payload.offset, payload.bytes);
            if (completion.bytes > 0) arena.free(completion.offset, completion.bytes);
        },
    };
};

/** Every key a leaf names in its declaration, so the thread finds the world's numbers for them. */
const keysOf = (leaf: Leaf): readonly symbol[] => {
    const { components, lookup, resources, reduce } = leaf.declaration;
    const keys = new Set<Key>([
        ...components?.read ?? [], ...components?.write ?? [], ...components?.has ?? [], ...components?.not ?? [], ...components?.added ?? [], ...components?.changed ?? [],
        ...resources?.read ?? [], ...resources?.write ?? [], ...resources?.changed ?? [], ...resources?.is ?? [], ...resources?.not ?? [],
    ]);
    for (const name in lookup) for (const key of [...lookup[name].read ?? [], ...lookup[name].has ?? [], ...lookup[name].not ?? []]) keys.add(key);
    if (reduce !== undefined) for (const key of Object.getOwnPropertySymbols(reduce)) keys.add(key);
    return [...keys].filter((key): key is symbol => typeof key === "symbol");
};

/** Every key a finalizer names, so the thread finds the world's numbers for them: it looks up nothing. */
export const finalizerKeysOf = (finalizer: FinalizerLeaf): readonly symbol[] => {
    const { components, resources } = finalizer.declaration;
    const keys = new Set<Key>([...components.read ?? [], ...components.has ?? [], ...components.not ?? [], ...resources?.read ?? []]);
    return [...keys].filter((key): key is symbol => typeof key === "symbol");
};

/** Why a leaf can't run on a joined thread, or null when it can: `up` runs only on the world's thread. */
export const unplaceable = (leaf: Leaf, thread: string): string | null =>
    leaf.declaration.up !== undefined ? `System "${labelOfItem(leaf)}" runs on thread "${thread}", which a joined thread fills, and declares up, which runs only on the world's thread.` : null;

/**
 * A runner standing for a system placed on a joined thread: what the world's schedule needs of it, its matches for
 * GPU readbacks, and its folds as its last task gave them. `since` is the tick it last ran at, wherever it ran.
 */
export const createRemoteRunner = (state: State, leaf: Leaf, channel: TaskChannel, since = 0): Runner => {
    const { declaration } = leaf;
    const { components: query } = declaration;
    const thread = threadOf(declaration, "System", leaf.name) ?? "world";
    const label = labelOfItem(leaf);
    const problem = unplaceable(leaf, thread);
    if (problem !== null) throw new Error(problem);
    const index = channel.place(state, leaf);
    const required = [...new Set([...query?.read ?? [], ...query?.write ?? [], ...query?.has ?? [], ...query?.added ?? [], ...query?.changed ?? []])].map(key => idOf(state, key));
    const excluded = (query?.not ?? []).map(key => idOf(state, key));
    const touches = [...new Set([...query?.read ?? [], ...query?.write ?? []])].map(key => idOf(state, key));
    const writes = (query?.write ?? []).map(key => idOf(state, key));
    const looks = [...new Set(Object.values(declaration.lookup ?? {}).flatMap(lookup => lookup.read ?? []))].map(key => idOf(state, key));
    const targets = reductionTargets(state, declaration);
    const folds = targets.map(target => new Float64Array(target.leaves.length));
    const matches: Archetype[] = [];
    let checked = 0;
    const matched = (): readonly Archetype[] => {
        for (; checked < state.archetypes.length; checked++) {
            const archetype = state.archetypes[checked];
            if (query !== undefined && !archetype.resource && required.every(id => archetype.storageOf.has(id)) && !excluded.some(id => archetype.storageOf.has(id))) matches.push(archetype);
        }
        return matches;
    };
    const remote: RemoteSystem = {
        channel, index, label,
        warning: { kind: "blocking", name: label, message: `System "${label}" runs on thread "${thread}", which a joined thread fills, so its tier waits for that thread.` },
        targets, folds, foldCount: folds.reduce((sum, leaves) => sum + leaves.length, 0),
        changed: (query?.changed ?? []).map(key => idOf(state, key)),
        declaresInput: declaration.input !== undefined,
        lastRun: since,
        result: { flags: 0, segment: undefined, error: undefined },
        tail: null,
    };
    return {
        kernel: null,
        placement: "cpu",
        touches,
        writes,
        looks,
        resourceWrites: resourceWritesOf(state, declaration),
        matched,
        load: async () => {},
        setup: () => null,
        start: () => [],
        targets,
        finish: failed => failed || (remote.result.flags & ranFlag) === 0 || targets.length === 0 ? null : folds,
        afterSync: null,
        remote,
        lastRun: () => remote.lastRun,
    };
};

/**
 * Before a task: a GPU kernel's writes stamp a whole column at once, which a thread's `changed` filters can't see, so
 * the rows of a column stamped since the system last ran take the stamp.
 */
export const liftColumnStamps = (runner: Runner): void => {
    const remote = runner.remote;
    if (remote === null || remote.changed.length === 0) return;
    for (const archetype of runner.matched()) {
        for (const id of remote.changed) {
            const storage = archetype.storageById[id];
            if (storage === undefined || !storage.ticked || storage.columnChanged <= remote.lastRun) continue;
            const stamp = storage.columnChanged;
            for (let row = 0; row < archetype.count; row++) if (storage.changed[row] < stamp) storage.changed[row] = stamp;
            for (let chunk = 0; chunk <= (archetype.count - 1) >> chunkShift; chunk++) if (storage.chunkChanged[chunk] < stamp) storage.chunkChanged[chunk] = stamp;
        }
    }
};
