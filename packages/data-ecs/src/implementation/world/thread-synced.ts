import type { Commands } from '../../interface/system/commands.js';
import type { Leaf } from '../../interface/system/leaf.js';
import type { Failure } from '../../interface/world/report.js';
import { definitionOf, isLeaf, itemOfId, labelOfItem } from '../../interface/registry/index.js';
import { failureOf } from './failures.js';
import { cancelled, notRun, outcomeWord, postedWord, removedWord, runsWord, syncedBlockWords, syncWord, tickSlot } from './joined-synced.js';
import { protocolName, type SyncedSetup, type ToWorld } from './joining.js';
import type { Mirror } from './mirror.js';
import type { WorkerError } from './protocol.js';
import { doneWord, endWord, progressWord, tailChunk } from './tail-blocks.js';
import type { ThreadDirectory } from './thread-directory.js';
import { createThreadRunner, type RunnerHost, type ThreadRunner } from './thread-systems.js';

// A joined thread's synced systems (threads.md, "Synced systems on joined threads"): the world posts each into its
// block after a sync point; this thread claims a post, as a tail claims its rows, reading the shared memory as of that
// sync point, or the copy a later writer took, and runs the system once.

/** What the thread gives its synced systems. */
export type ThreadSyncedHost = {
    readonly directory: ThreadDirectory;
    readonly mirror: Mirror | null;
    readonly post: (message: ToWorld) => void;
    /** Brings the mirror up to the newest published sync; false while it can't yet. */
    readonly current: () => boolean;
    /** This thread's own synced system by its number, while it lives. */
    readonly localOf: (number: number) => Local | undefined;
};

/**
 * A synced system of this thread's own, by its number for it: its value, its runner once the world placed it, and
 * what its runs gave, by the newest run each post was for.
 */
export type Local = {
    readonly number: number;
    readonly leaf: Leaf;
    runner: ThreadRunner | null;
    /** The newest of its runs a post ran for, and the failure of each such post, in order. */
    ran: number;
    readonly results: { readonly through: number; readonly failure: Failure | null }[];
    /** Whether it's placed on this thread now: false once removed, until placed again. */
    placed: boolean;
    /** The last of this thread's runs posted before it was last removed here: those that didn't run then never do. */
    stopped: number;
};

/** A synced system the world placed here: its block's views, the last post it ran, and its runner or local system. */
type Placed = {
    readonly index: number;
    readonly label: string;
    readonly control: Int32Array;
    readonly ticks: Float64Array;
    handled: number;
    /** One the world names by id, which lives as long as its module. */
    readonly runner: ThreadRunner | null;
    /** One of this thread's own, kept only while it lives. */
    readonly local: WeakRef<Local> | null;
    stopped: boolean;
};

const errorOf = (error: unknown): WorkerError =>
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { name: "Error", message: String(error) };

const refuse = (): never => { throw new Error("A synced system issues no commands."); };
/** A synced system's context has no commands, so these are never called. */
const noCommands: Commands = { spawn: refuse, despawn: refuse, add: refuse, remove: refuse };
const noStamps: number[] = [];

export const createThreadSynced = (host: ThreadSyncedHost) => {
    const { directory, mirror } = host;
    const runnerHost: RunnerHost = {
        rows: directory.rows, archetypeAt: directory.archetypeAt, countOf: directory.countOf, tableCount: directory.tableCount,
        resourceRow: directory.resourceRow, refreshEntities: directory.refreshEntities, commands: noCommands,
        numberOf: directory.numberOf, layoutOf: directory.layoutOf, mirror, refresh: directory.refresh,
    };
    const placed: (Placed | undefined)[] = [];

    /** Records synced systems the world places here; one by an id this thread never imported doesn't run. */
    const setup = (systems: readonly SyncedSetup[]): void => {
        directory.name(systems);
        const buffer = directory.refresh();
        for (const { index, local, id, block, indexes } of systems) {
            const records = new Map(indexes);
            const control = new Int32Array(buffer, block, syncedBlockWords);
            const ticks = new Float64Array(buffer, block + tickSlot * 8, 2);
            if (local !== null) {
                const own = host.localOf(local);
                if (own === undefined) continue;
                own.runner = createThreadRunner(runnerHost, own.leaf, records);
                own.placed = true;
                placed[index] = { index, label: labelOfItem(own.leaf), control, ticks, handled: 0, runner: null, local: new WeakRef(own), stopped: false };
                continue;
            }
            const item = id === null ? undefined : itemOfId(id);
            const definition = item === undefined ? undefined : definitionOf(item);
            const leaf = definition !== undefined && isLeaf(definition) ? definition : null;
            placed[index] = { index, label: leaf === null ? String(id) : labelOfItem(leaf), control, ticks, handled: 0, runner: leaf === null ? null : createThreadRunner(runnerHost, leaf, records), local: null, stopped: false };
        }
    };

    /** The world removed synced systems here: dropped, and the world told. */
    const unplace = (indexes: readonly number[]): void => {
        for (const index of indexes) {
            const entry = placed[index];
            if (entry === undefined) continue;
            entry.stopped = true;
            entry.runner?.halt();
            const own = entry.local?.deref();
            if (own !== undefined && own.runner !== null && placed[index] === entry) {
                own.placed = false;
            }
            placed[index] = undefined;
        }
        host.post({ protocol: protocolName, kind: "synced dropped", indexes });
    };

    /** Stops this thread's own system at once, as it's removed here: no row of it runs from now on. */
    const stop = (local: Local): void => {
        local.runner?.halt();
        local.runner = null;
        local.placed = false;
        for (const entry of placed) if (entry !== undefined && entry.local?.deref() === local) entry.stopped = true;
    };

    /** Settles a claimed post having run nothing. */
    const finishUnrun = (control: Int32Array): void => {
        Atomics.store(control, outcomeWord, notRun);
        Atomics.store(control, doneWord, Atomics.load(control, endWord));
        Atomics.notify(control, doneWord);
    };

    /** Gives back a claim it can't run yet, owed to a run: run nothing, and the world posts it again between runs. */
    const giveBack = (control: Int32Array): void => {
        finishUnrun(control);
        if (Atomics.load(control, runsWord) > 0) host.post({ protocol: protocolName, kind: "synced again" });
    };

    /** Runs a new post of one placed here, if it has one and the world hasn't cancelled it; returns whether it did. */
    const runPost = (entry: Placed, errors: [number, WorkerError][]): boolean => {
        const { control } = entry;
        if (Atomics.load(control, postedWord) === entry.handled) return false;
        const own = entry.local?.deref();
        const runner = entry.runner ?? own?.runner ?? null;
        if (entry.stopped || runner === null || Atomics.load(control, removedWord) !== 0) {
            // Run as nothing, so the world, which may wait for it, settles it.
            const claimed = Atomics.add(control, progressWord, tailChunk);
            entry.handled = Atomics.load(control, postedWord);
            if (claimed < cancelled) finishUnrun(control);
            return false;
        }
        // This thread's objects are read as of the post's sync: replayed through the newest first.
        if (mirror !== null && !host.current()) return false;
        const claimed = Atomics.add(control, progressWord, tailChunk);
        // Claimed, the post stays as it is until it's done.
        entry.handled = Atomics.load(control, postedWord);
        if (claimed >= cancelled) return false;
        const sync = Atomics.load(control, syncWord) >>> 0;
        if (mirror !== null && mirror.through !== sync && (!host.current() || mirror.through !== sync)) {
            giveBack(control);
            return false;
        }
        directory.rows.tick = entry.ticks[0];
        const outcome = runner.runTail(entry.ticks[1], undefined, control, sync, 0, noStamps, claimed, outcomeWord);
        const runs = Atomics.load(control, runsWord);
        const failure = outcome.error === undefined ? null : failureOf("system", entry.label, outcome.error);
        if (own !== undefined && runs > 0) {
            own.ran = Math.max(own.ran, runs);
            own.results.push({ through: runs, failure });
        }
        else if (outcome.error !== undefined) errors.push([entry.index, errorOf(outcome.error)]);
        return true;
    };

    /** Runs every new post here; returns how many ran. What an added one threw goes to the world, for its next report. */
    const process = (): number => {
        let ran = 0;
        let errors: [number, WorkerError][] | null = null;
        for (let k = 0; k < placed.length; k++) {
            const entry = placed[k];
            if (entry === undefined) continue;
            if (runPost(entry, errors ??= [])) ran++;
        }
        if (errors !== null && errors.length > 0) host.post({ protocol: protocolName, kind: "synced failed", errors });
        return ran;
    };

    return {
        setup,
        unplace,
        stop,
        process,
        /** Whether any synced system is placed here. */
        active: (): boolean => placed.some(entry => entry !== undefined),
        /** For tests of what a thread holds: how many synced systems are placed here. */
        placedCount: (): number => placed.filter(entry => entry !== undefined).length,
    };
};

/** The failure of a run of a local synced system, once a post for it ran: undefined until then. */
export const resultOf = (local: Local, sequence: number): { readonly failure: Failure | null } | undefined => {
    if (local.ran < sequence) return undefined;
    const found = local.results.find(result => result.through >= sequence);
    // Earlier results are for runs settled before this one.
    while (local.results.length > 1 && local.results[0].through < sequence) local.results.shift();
    return found === undefined ? { failure: null } : found;
};
