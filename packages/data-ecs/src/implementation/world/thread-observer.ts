import type { Commands } from '../../interface/system/commands.js';
import type { Leaf } from '../../interface/system/leaf.js';
import { definitionOf, isLeaf, itemOfId, labelOfItem } from '../../interface/registry/index.js';
import { cancelled, notRun, opening, outcomeWord, postedWord, removedWord, runsWord, observerBlockWords, syncWord, tickSlot } from './joined-observer.js';
import { protocolName, type ObserverSetup, type ToWorld } from './joining.js';
import type { Mirror } from './mirror.js';
import type { WorkerError } from './protocol.js';
import { doneWord, endWord, progressWord, tailChunk } from './tail-blocks.js';
import type { ThreadDirectory } from './thread-directory.js';
import { createThreadRunner, type RunnerHost, type ThreadRunner } from './thread-systems.js';

// A joined thread's observer systems (threads.md, "Observer systems on joined threads"): the world posts each into its
// block after a sync point; this thread claims a post, as a tail claims its rows, reading the shared memory as of that
// sync point, or the copy a later writer took, and runs the system once.

/** What the thread gives its observer systems. */
export type ThreadObserverHost = {
    readonly directory: ThreadDirectory;
    readonly mirror: Mirror | null;
    readonly post: (message: ToWorld) => void;
    /** Brings the mirror up to the newest published sync; false while it can't yet. */
    readonly current: () => boolean;
    /** This thread's own observer system by its number, while it lives. */
    readonly localOf: (number: number) => Local | undefined;
};

/**
 * An observer system of this thread's own, by its number for it: its value, its runner once the world placed it, and
 * the newest of its runs a post ran for.
 */
export type Local = {
    readonly number: number;
    readonly leaf: Leaf;
    runner: ThreadRunner | null;
    ran: number;
    /** Whether it's placed on this thread now: false once removed, until placed again. */
    placed: boolean;
    /** The last of this thread's runs posted before it was last removed here: those that didn't run then never do. */
    stopped: number;
};

/** A block the world posts an observer system into: its views, and the last post of it this thread handled. */
type Block = { readonly control: Int32Array; readonly ticks: Float64Array; handled: number };

/**
 * An observer system the world placed here: its blocks' views, two for one reading only struct resources, whose posts
 * hold copies of what they read, and its runner or local system.
 */
type Placed = {
    readonly index: number;
    readonly label: string;
    readonly blocks: readonly Block[];
    /** Whether its posts read only their blocks, never this thread's objects. */
    readonly contained: boolean;
    /** One the world names by id, which lives as long as its module. */
    readonly runner: ThreadRunner | null;
    /** One of this thread's own, kept only while it lives. */
    readonly local: WeakRef<Local> | null;
    stopped: boolean;
};

const errorOf = (error: unknown): WorkerError =>
    error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { name: "Error", message: String(error) };

const refuse = (): never => { throw new Error("An observer system issues no commands."); };
/** An observer system's context has no commands, so these are never called. */
const noCommands: Commands = { spawn: refuse, despawn: refuse, add: refuse, remove: refuse };
const noStamps: number[] = [];

export const createThreadObserver = (host: ThreadObserverHost) => {
    const { directory, mirror } = host;
    const runnerHost: RunnerHost = {
        rows: directory.rows, archetypeAt: directory.archetypeAt, countOf: directory.countOf, tableCount: directory.tableCount,
        resourceRow: directory.resourceRow, refreshEntities: directory.refreshEntities, commands: noCommands,
        numberOf: directory.numberOf, layoutOf: directory.layoutOf, mirror, refresh: directory.refresh,
    };
    const placed: (Placed | undefined)[] = [];

    /** Records observer systems the world places here; one by an id this thread never imported doesn't run. */
    const setup = (systems: readonly ObserverSetup[]): void => {
        directory.name(systems);
        const buffer = directory.refresh();
        for (const { index, local, id, block, spare, indexes } of systems) {
            const records = new Map(indexes);
            const blocks = (spare === null ? [block] : [block, spare]).map((at): Block => ({
                control: new Int32Array(buffer, at, observerBlockWords), ticks: new Float64Array(buffer, at + tickSlot * 8, 2), handled: 0,
            }));
            const contained = spare !== null;
            if (local !== null) {
                const own = host.localOf(local);
                if (own === undefined) continue;
                own.runner = createThreadRunner(runnerHost, own.leaf, records);
                own.placed = true;
                placed[index] = { index, label: labelOfItem(own.leaf), blocks, contained, runner: null, local: new WeakRef(own), stopped: false };
                continue;
            }
            const item = id === null ? undefined : itemOfId(id);
            const definition = item === undefined ? undefined : definitionOf(item);
            const leaf = definition !== undefined && isLeaf(definition) ? definition : null;
            placed[index] = { index, label: leaf === null ? String(id) : labelOfItem(leaf), blocks, contained, runner: leaf === null ? null : createThreadRunner(runnerHost, leaf, records), local: null, stopped: false };
        }
    };

    /** The world removed observer systems here: dropped, and the world told. */
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
        host.post({ protocol: protocolName, kind: "observer dropped", indexes });
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
        if (Atomics.load(control, runsWord) > 0) host.post({ protocol: protocolName, kind: "observer again" });
    };

    /**
     * Runs a new post in a block of one placed here, if it has one and the world hasn't cancelled it; returns whether
     * it did, or the errors so far with what it threw.
     */
    const runPost = (entry: Placed, block: Block, errors: [number, WorkerError][] | null): [number, WorkerError][] | null | true | false => {
        const { control } = block;
        // The post seen: one a claim finds cancelled is this one, as a later one is written only once it's cancelled.
        const seen = Atomics.load(control, postedWord);
        if (seen === block.handled) return false;
        const own = entry.local?.deref();
        const runner = entry.runner ?? own?.runner ?? null;
        if (entry.stopped || runner === null || Atomics.load(control, removedWord) !== 0) {
            // Run as nothing, so the world, which may wait for it, settles it.
            const claimed = Atomics.add(control, progressWord, tailChunk);
            // One the world is writing is claimed once it's open.
            if (claimed >= opening) return false;
            if (claimed >= cancelled) {
                block.handled = seen;
                return false;
            }
            // Claimed, the post in the block stays until it's done, so its posted word is this one's.
            block.handled = Atomics.load(control, postedWord);
            finishUnrun(control);
            return false;
        }
        // This thread's objects are read as of the post's sync: replayed through the newest first.
        const bounded = mirror !== null && !entry.contained;
        if (bounded && !host.current()) return false;
        const claimed = Atomics.add(control, progressWord, tailChunk);
        // One the world is writing is claimed once it's open. Claimed now, the post stays as it is until it's done, so
        // the posted word read after the claim is its own.
        if (claimed >= opening) return false;
        // Cancelled, it's the post seen: one written after it, whose posted word may already have moved, is claimed
        // next.
        if (claimed >= cancelled) {
            block.handled = seen;
            return false;
        }
        block.handled = Atomics.load(control, postedWord);
        const sync = Atomics.load(control, syncWord) >>> 0;
        if (bounded && mirror.through !== sync && (!host.current() || mirror.through !== sync)) {
            giveBack(control);
            return false;
        }
        // The world's memory may have grown since the last post: its views cover it first.
        directory.refresh();
        directory.rows.tick = block.ticks[0];
        // Read first: the world may write its next post here once this one says what it did.
        const runs = Atomics.load(control, runsWord);
        const outcome = runner.runTail(block.ticks[1], undefined, control, sync, 0, noStamps, claimed, outcomeWord);
        if (own !== undefined && runs > 0) own.ran = Math.max(own.ran, runs);
        if (outcome.error !== undefined) {
            const found = errors ?? [];
            found.push([entry.index, errorOf(outcome.error)]);
            return found;
        }
        return true;
    };

    /**
     * Runs every new post here; returns how many ran. What one threw goes to the world, for its next report.
     * Of a system's two blocks, only one holds a post it hasn't claimed, the newest.
     */
    const process = (): number => {
        let ran = 0;
        let errors: [number, WorkerError][] | null = null;
        for (let k = 0; k < placed.length; k++) {
            const entry = placed[k];
            if (entry === undefined) continue;
            for (let b = 0; b < entry.blocks.length; b++) {
                const result = runPost(entry, entry.blocks[b], errors);
                if (result === false) continue;
                ran++;
                if (result !== true) errors = result;
            }
        }
        if (errors !== null && errors.length > 0) host.post({ protocol: protocolName, kind: "observer failed", errors });
        return ran;
    };

    return {
        setup,
        unplace,
        stop,
        process,
        /** Whether any observer system is placed here. */
        active: (): boolean => placed.some(entry => entry !== undefined),
        /** For tests of what a thread holds: how many observer systems are placed here. */
        placedCount: (): number => placed.filter(entry => entry !== undefined).length,
    };
};

/** Whether a post ran for run `sequence` of a local observer system, or none ever will, since it was removed first. */
export const settledFor = (local: Local, sequence: number): boolean => local.ran >= sequence || local.stopped >= sequence;
