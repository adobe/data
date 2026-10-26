// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Leaf } from '../../interface/system/leaf.js';
import type { Chunk, ChunkResult, Runner, Workers } from './runner.js';
import type { Schedule } from '../../interface/registry/schedule.js';
import type { Archetype, Storage } from './archetype.js';
import { countRan, idOf, startRan, type State } from './state.js';
import type { GpuEngine } from './gpu.js';
import { applySync, prepareSync, syncPending } from './synchronize.js';
import { activate } from './activate.js';
import { markRun } from './move-log.js';
import { postTails, settleAll, settleKeys, settleRunners, tailsOf, type TailOutcome } from './tails.js';
import { settlePosts, settleObserverKeys, settleObserverRunners } from './joined-observer.js';
import { locate } from './entities.js';
import { clearBuffer, createBuffer } from './buffer.js';
import { drainSegment, type Segment } from './command-ring.js';
import { combine, identityOf, writeReduction, type ReductionTarget } from './reductions.js';
import type { Failure, RunReport, Warning } from './failures.js';
import { liftColumnStamps, type RemoteSystem, type TaskChannel } from './remote-systems.js';
import { failureOf } from './failures.js';
import { checkCommands } from './remote.js';
import { firstKeyOf } from '../../interface/registry/index.js';
import { mergeUses, refreshUses, type IndexUse } from './indexes.js';

/** Shared by every report without failures or skipped systems: they're read-only, so none needs its own. */
const none: readonly never[] = [];
const noChunks: readonly Chunk[] = [];
/** The report of a run with nothing to report. */
export const clean: RunReport = { failures: none, skipped: none, dropped: 0, warnings: none };

export type ExecuteContext = {
    readonly state: State;
    readonly runnerOf: (leaf: Leaf) => Runner;
    readonly kernelIndexOf: (runner: Runner) => number;
    readonly workers: Workers | null;
    /** Tells workers about layout changes; called after the sync point. */
    readonly publish: () => void;
    /** The last run's tails, posted after its sync point, until the caller takes them; null when it had none. */
    tails: Promise<TailOutcome> | null;
};

/**
 * Runs a schedule tier by tier, then applies one sync point, and reports what went wrong. Within a tier, kernels start
 * first so workers run while main-thread systems do; commands merge in tier order, then chunk order, whichever thread
 * ran them. A failing system stops the run after its tier finishes: later tiers are skipped, and commands so far still
 * apply. `system` is the one the run was given, which the GPU's errors are reported under.
 */
export const execute = (context: ExecuteContext, schedule: Schedule, args: unknown, system: { readonly name: string }): RunReport | Promise<RunReport> => {
    const { gpu } = context.state;
    if (gpu === null) return executeTiers(context, schedule, args);
    return executeOnDevice(context, gpu, schedule, args, system);
};

/**
 * `execute` with a GPU device, within error scopes, whose errors are reported out of band once the GPU gives them:
 * waiting for them would hold every run until the GPU process catches up.
 */
const executeOnDevice = async (context: ExecuteContext, gpu: GpuEngine, schedule: Schedule, args: unknown, system: { readonly name: string }): Promise<RunReport> => {
    const lost = gpu.lost();
    // Lost since the run started; the world sets gpuDevice to null before the next one.
    if (lost !== null) throw new Error(`The world's GPU device was lost during this run: ${lost}.`);
    gpu.device.pushErrorScope("out-of-memory");
    gpu.device.pushErrorScope("validation");
    try {
        return await executeTiers(context, schedule, args);
    }
    finally {
        gpu.reportErrors(system, gpu.device.popErrorScope(), gpu.device.popErrorScope());
    }
};

/**
 * A run's fold into one reduced resource: it starts at the operator's identity, and is written once its last
 * contributor finishes, unless one failed or none ran its rows.
 */
type Fold = { target: ReductionTarget | null; readonly values: number[]; remaining: number; ran: boolean; failed: boolean };

/** Folds a contributor's leaves into its run's folds, writing each resource whose contributors have all finished. */
const contribute = (state: State, folds: ReadonlyMap<unknown, Fold>, runner: Runner, folded: readonly Float64Array[] | null, failed: boolean): void => {
    runner.targets.forEach((target, t) => {
        const fold = folds.get(target.key) ?? folds.get(firstKeyOf(target.key));
        if (fold === undefined) return;
        fold.target ??= target;
        if (fold.values.length === 0) fold.values.push(...target.leaves.map(() => identityOf(target.operator)));
        const leaves = folded?.[t];
        if (failed) fold.failed = true;
        else if (leaves !== undefined) {
            fold.ran = true;
            for (let i = 0; i < leaves.length; i++) fold.values[i] = combine(target.operator, fold.values[i] ?? NaN, leaves[i] ?? NaN);
        }
        if (--fold.remaining === 0 && fold.ran && !fold.failed) writeReduction(state, target, fold.values, 0, state.tick);
    });
};

/**
 * A schedule's runners by tier, and an array per tier for their chunks, made on its first run and reused. Runners are
 * read again each run, since moving to or from a GPU device replaces them.
 */
type Prepared = {
    readonly runners: Runner[][];
    /** How many of each tier's runners run on joined threads. */
    readonly remotes: number[];
    /** The indexes each tier's runners look up through, refreshed before it. */
    readonly uses: (readonly IndexUse[])[];
    /** The world's `runnersVersion` its runners were read at. */
    version: number;
    readonly started: (readonly Chunk[])[][];
    /** For tasks on joined threads: the systems of the one being posted and their tiers in it, and by channel, the tier's task. */
    readonly systems: RemoteSystem[];
    readonly tiers: number[];
    readonly tasks: Map<TaskChannel, Promise<boolean>>;
    /**
     * The run's warnings, the first `warningCount`, and the last report made of warnings alone, reused while a run's
     * are the same. Counted rather than truncated: setting an array's length costs a run more than all of this.
     */
    readonly warnings: Warning[];
    warningCount: number;
    warned: RunReport | null;
    /** The run's failures and skipped systems, allocated only when there's something to list. */
    readonly outcome: Outcome;
    /** The placement its tails were found for, and they: the schedule without them, and them in schedule order. */
    placement: number;
    tailing: Tailing | null;
    /**
     * Where settling the tier in progress is: the runner, its chunk, the runner's first error so far, and whether a
     * runner of the tier failed, so settling can stop at a promise and go on once it settles.
     */
    settling: number;
    chunk: number;
    error: unknown;
    tierFailed: boolean;
};

/** A schedule's tails: the schedule without them, and their runners, leaves and tiers in schedule order. */
type Tailing = { readonly schedule: Schedule; readonly runners: Runner[]; readonly leaves: readonly Leaf[]; readonly tiers: readonly number[] };

/** Finds a schedule's tails where its systems are placed now; null without any. */
const tailingOf = (context: ExecuteContext, schedule: Schedule): Tailing | null => {
    const flags = tailsOf(schedule, context.runnerOf);
    const leaves: Leaf[] = [];
    const tiers: number[] = [];
    const rest: Leaf[][] = [];
    schedule.tiers.forEach((tier, t) => {
        const kept = tier.filter((leaf, i) => {
            if (!flags[t][i]) return true;
            leaves.push(leaf);
            tiers.push(t);
            return false;
        });
        if (kept.length > 0) rest.push(kept);
    });
    if (leaves.length === 0) return null;
    return { schedule: { tiers: rest, reductions: schedule.reductions, observer: schedule.observer }, runners: leaves.map(context.runnerOf), leaves, tiers };
};

type Outcome = { failures: Failure[] | null; skipped: Leaf[] | null };
const preparedBy = new WeakMap<ExecuteContext, WeakMap<Schedule, Prepared>>();

const preparedFor = (context: ExecuteContext, schedule: Schedule): Prepared => {
    let bySchedule = preparedBy.get(context);
    if (bySchedule === undefined) preparedBy.set(context, bySchedule = new WeakMap());
    let prepared = bySchedule.get(schedule);
    if (prepared === undefined) {
        prepared = {
            runners: schedule.tiers.map(tier => tier.map(context.runnerOf)), remotes: schedule.tiers.map(() => 0), uses: schedule.tiers.map(() => []), version: -1,
            started: schedule.tiers.map(tier => new Array<readonly Chunk[]>(tier.length)),
            systems: [], tiers: [], tasks: new Map(), warnings: [], warningCount: 0, warned: null, outcome: { failures: null, skipped: null },
            placement: -1, tailing: null, settling: 0, chunk: 0, error: undefined, tierFailed: false,
        };
        bySchedule.set(schedule, prepared);
    }
    if (prepared.version !== context.state.runnersVersion) refresh(context, schedule, prepared);
    return prepared;
};

/** Reads a schedule's runners again, once one was replaced, as moving to or from a GPU device or a joined thread does. */
const refresh = (context: ExecuteContext, schedule: Schedule, prepared: Prepared): void => {
    for (let t = 0; t < schedule.tiers.length; t++) {
        const tier = schedule.tiers[t];
        const runners = prepared.runners[t];
        let remote = 0;
        for (let i = 0; i < tier.length; i++) if ((runners[i] = context.runnerOf(tier[i])).remote !== null) remote++;
        prepared.remotes[t] = remote;
        prepared.uses[t] = mergeUses(runners);
    }
    prepared.version = context.state.runnersVersion;
};

/**
 * Drains a worker's segment into a buffer of its own, queued in its place: commands, spawn blocks staged to commit in
 * its place, and the reservations it left unused. Fails if it doesn't start with its task's merge tag.
 */
const drain = (state: State, { bytes, tag }: Segment): Error | undefined => {
    const buffer = state.drains[state.drained] ??= createBuffer();
    state.drained++;
    if (!drainSegment(buffer, bytes, state.layouts, state.starts, state.unused, tag)) return new Error("A worker's commands came back under another task's merge tag.");
    // Systems can't touch the resource entity; only registration adds resources.
    if (buffer.count > 0 || buffer.stagedCount > 0) state.queued.push({ buffer, guarded: true });
    return undefined;
};

/**
 * Queues a settled chunk's commands, a worker's drained from its segment, and returns its error, if it failed. Once a
 * joined thread fills objects, values given them here are checked, each command giving another value dropped.
 */
const queue = (state: State, { commands, segment, error }: ChunkResult): unknown => {
    const drained = segment === undefined ? undefined : drain(state, segment);
    let checked: Error | undefined;
    if (state.claimed) {
        checked = checkCommands(state, commands);
        if (segment !== undefined) checked ??= checkCommands(state, state.drains[state.drained - 1]);
    }
    if (commands.count > 0 || commands.stagedCount > 0) state.queued.push({ buffer: commands, guarded: true });
    return error ?? drained ?? checked;
};

/**
 * Queues the commands a joined thread's system gave back, drained from its segment with the thread's numbers for keys
 * mapped, and returns its error, if it failed. Values it gave its own objects are its slots; others are checked.
 */
const queueRemote = (state: State, { channel, result }: RemoteSystem): unknown => {
    const { segment } = result;
    if (segment === undefined) return result.error;
    const buffer = state.drains[state.drained] ??= createBuffer();
    state.drained++;
    if (!drainSegment(buffer, segment.bytes, state.layouts, state.starts, state.unused, segment.tag, channel.local)) {
        return result.error ?? new Error("A joined thread's commands came back under another task's merge tag, or name a key this world never imported.");
    }
    const checked = checkCommands(state, buffer, channel.log);
    if (buffer.count > 0 || buffer.stagedCount > 0) state.queued.push({ buffer, guarded: true });
    return result.error ?? checked;
};

/** What a joined thread's system gave back once its task settled: `gone` while its thread is gone, else its error. */
const gone = Symbol("gone");
const settleRemote = (state: State, remote: RemoteSystem, done: boolean): unknown => done ? queueRemote(state, remote) : gone;

/** Whether every runner of a tier runs on `channel`'s thread. */
const allOn = (runners: readonly Runner[], channel: TaskChannel): boolean => {
    for (let i = 0; i < runners.length; i++) if (runners[i].remote?.channel !== channel) return false;
    return runners.length > 0;
};

/** Once a sync point applied or failed: empties the buffers workers' and joined threads' segments drained into, and their command rings. */
const rewind = (state: State, workers: Workers | null): void => {
    for (let k = 0; k < state.drained; k++) clearBuffer(state.drains[k]);
    state.drained = 0;
    workers?.pool.rewind();
    for (let k = 0; k < state.channels.length; k++) state.channels[k].rewind();
};

const firstOf = (first: unknown, next: unknown): unknown => first === undefined ? next : first;

const isResults = (result: ChunkResult | readonly ChunkResult[]): result is readonly ChunkResult[] => Array.isArray(result);

/**
 * A system's outcome in `outcome`: a failure, or a skip with a `"thread"` failure, and its fold. Returns whether it
 * failed, which stops the run after its tier.
 */
const settled = (state: State, folds: ReadonlyMap<unknown, Fold> | null, outcome: Outcome, runner: Runner, leaf: Leaf, error: unknown): boolean => {
    if (error === gone) {
        (outcome.failures ??= []).push(failureOf("thread", leaf, runner.remote?.channel.goneError()));
        (outcome.skipped ??= []).push(leaf);
        if (folds !== null && runner.targets.length > 0) contribute(state, folds, runner, null, true);
        return false;
    }
    const failed = error !== undefined;
    if (failed) (outcome.failures ??= []).push(failureOf("system", leaf, error));
    if (folds !== null && runner.targets.length > 0) contribute(state, folds, runner, runner.finish(failed), failed);
    return failed;
};

/**
 * Adds the systems of `runners` on `channel`'s thread to the task being gathered, with tier `tier` within it. One
 * removed since its tier was read, by a body that ran meanwhile, is left out, giving back nothing, as one its thread
 * skipped: the thread drops it once the tasks posted before its removal are done, so a later task can't name it. The
 * caller posts the task with no await between, and `channel` has none in flight, so nothing else reads the result
 * reset.
 */
const gather = (prepared: Prepared, runners: readonly Runner[], channel: TaskChannel, tier: number): void => {
    for (let i = 0; i < runners.length; i++) {
        const { remote } = runners[i];
        if (remote === null || remote.channel !== channel) continue;
        if (runners[i].holdings.removed) {
            const { result } = remote;
            result.flags = 0;
            result.segment = undefined;
            result.error = undefined;
            result.value = undefined;
            continue;
        }
        liftColumnStamps(runners[i]);
        prepared.systems.push(remote);
        prepared.tiers.push(tier);
        prepared.warnings[prepared.warningCount++] = remote.warning;
    }
};

/** Posts the task gathered, on `channel`'s thread. */
const post = (state: State, prepared: Prepared, channel: TaskChannel, args: unknown): Promise<boolean> => {
    const task = channel.run(state, prepared.systems, prepared.tiers, args);
    prepared.systems.length = 0;
    prepared.tiers.length = 0;
    return task;
};

/** A task never posted, as for a thread that's gone. */
const notDone = Promise.resolve(false);

/**
 * Runs tiers from `first` on, as long as each is all on `channel`'s thread, as one task, with no barrier between them;
 * returns the last of them, or -1 when one failed, the tiers after it skipped.
 */
const runFused = async (context: ExecuteContext, schedule: Schedule, prepared: Prepared, folds: ReadonlyMap<unknown, Fold> | null, args: unknown, first: number, channel: TaskChannel): Promise<number> => {
    const { state } = context;
    const { gpu } = state;
    let last = first;
    if (prepared.version !== state.runnersVersion) refresh(context, schedule, prepared);
    // A tier using an index starts a task of its own, after the index is refreshed for it.
    while (last + 1 < schedule.tiers.length && allOn(prepared.runners[last + 1], channel) && prepared.uses[last + 1].length === 0) last++;
    if (channel.busy()) await channel.idle();
    for (let v = first; v <= last; v++) {
        if (state.tails.length !== 0) {
            const waiting = settleRunners(state, prepared.runners[v]);
            if (waiting !== null) await waiting;
        }
        if (state.observer.posts.length !== 0) {
            const waiting = settleObserverRunners(state, prepared.runners[v]);
            if (waiting !== null) await waiting;
        }
        if (gpu !== null) await readAhead(state, gpu, prepared.runners[v]);
    }
    // Gathered once nothing more is awaited, so a system removed while this waited is in no tier of the task.
    for (let v = first; v <= last; v++) gather(prepared, prepared.runners[v], channel, v - first);
    const done = await post(state, prepared, channel, args);
    const { outcome } = prepared;
    for (let v = first; v <= last; v++) {
        const leaves = schedule.tiers[v];
        const runners = prepared.runners[v];
        countRan(state, runners);
        let failed = false;
        for (let i = 0; i < runners.length; i++) {
            const { remote } = runners[i];
            if (remote !== null && settled(state, folds, outcome, runners[i], leaves[i], settleRemote(state, remote, done))) failed = true;
        }
        if (gpu !== null) markWrites(state, gpu, runners);
        if (failed) {
            for (let later = v + 1; later < schedule.tiers.length; later++) for (const leaf of schedule.tiers[later]) (outcome.skipped ??= []).push(leaf);
            return -1;
        }
    }
    return last;
};

/** Nothing given back: settling starts, or goes on past what it waited for without a value. */
const nothing = Symbol("nothing");
/** What a wait `settleTier` returned settles to: a chunk's results, or whether a joined thread's task was done. */
type Settled = ChunkResult | readonly ChunkResult[] | boolean | typeof nothing;

/** Starts tier `t`: its kernels first, so workers run while this thread runs its main-thread systems. */
const startTier = (context: ExecuteContext, prepared: Prepared, t: number, args: unknown): void => {
    const { workers, kernelIndexOf } = context;
    const runners = prepared.runners[t];
    const started = prepared.started[t];
    prepared.settling = 0;
    prepared.chunk = 0;
    prepared.error = undefined;
    prepared.tierFailed = false;
    for (let i = 0; i < runners.length; i++) if (runners[i].kernel !== null) started[i] = runners[i].start(args, workers, kernelIndexOf(runners[i]));
    for (let i = 0; i < runners.length; i++) if (runners[i].kernel === null && runners[i].remote === null) started[i] = runners[i].start(args, null, -1);
};

/**
 * Settles tier `t`'s runners from where `prepared` says settling is, queuing each chunk's commands and recording each
 * system's failure and fold. Returns what to wait for, whose value the caller passes back as `value`, or null once
 * every runner settled. Every chunk settles, even a failed one, so no worker is still writing at the sync point.
 * Chunks the main thread ran are settled already, so only those workers and joined threads run are waited for.
 */
const settleTier = (state: State, folds: ReadonlyMap<unknown, Fold> | null, prepared: Prepared, tier: readonly Leaf[], t: number, value: Settled): Promise<Settled> | null => {
    const runners = prepared.runners[t];
    const started = prepared.started[t];
    const { outcome } = prepared;
    let given = value;
    for (; prepared.settling < runners.length; prepared.settling++) {
        const i = prepared.settling;
        const runner = runners[i];
        const remoteSystem = runner.remote;
        if (remoteSystem !== null) {
            if (typeof given !== "boolean") return prepared.tasks.get(remoteSystem.channel) ?? notDone;
            if (settled(state, folds, outcome, runner, tier[i], settleRemote(state, remoteSystem, given))) prepared.tierFailed = true;
            given = nothing;
            continue;
        }
        const chunks = started[i];
        for (; prepared.chunk < chunks.length; prepared.chunk++) {
            const chunk = chunks[prepared.chunk];
            let result: ChunkResult | readonly ChunkResult[];
            if (chunk instanceof Promise) {
                if (given === nothing || typeof given === "boolean") return chunk;
                result = given;
                given = nothing;
            }
            else result = chunk;
            // Every chunk's commands queue, a failed system's included; its first error stands for it.
            if (isResults(result)) for (const each of result) prepared.error = firstOf(prepared.error, queue(state, each));
            else prepared.error = firstOf(prepared.error, queue(state, result));
        }
        const { error } = prepared;
        prepared.chunk = 0;
        prepared.error = undefined;
        started[i] = noChunks;
        const failed = error !== undefined;
        if (failed) {
            (outcome.failures ??= []).push(failureOf("system", tier[i], error));
            prepared.tierFailed = true;
        }
        if (folds !== null && runner.targets.length > 0) contribute(state, folds, runner, runner.finish(failed), failed);
    }
    return null;
};

/** Once tier `t` settled: counts what it ran and marks its writes. Returns whether it failed, every later tier then skipped. */
const endTier = (state: State, gpu: GpuEngine | null, prepared: Prepared, schedule: Schedule, t: number): boolean => {
    const runners = prepared.runners[t];
    if (prepared.remotes[t] > 0) prepared.tasks.clear();
    countRan(state, runners);
    if (gpu !== null) markWrites(state, gpu, runners);
    if (!prepared.tierFailed) return false;
    const { outcome } = prepared;
    for (let later = t + 1; later < schedule.tiers.length; later++) for (const leaf of schedule.tiers[later]) (outcome.skipped ??= []).push(leaf);
    return true;
};

/**
 * Runs a schedule tier by tier, then applies one sync point, and reports what went wrong (`execute`). Runs with no GPU,
 * tails or observer posts awaiting nothing, so a run that waits for nothing allocates no async frame: at the first
 * tier on a joined thread, index build across the pool or chunk on workers, `executeFrom` goes on from there.
 */
const executeTiers = (context: ExecuteContext, whole: Schedule, args: unknown): RunReport | Promise<RunReport> => {
    const { state, workers } = context;
    context.tails = null;
    startRan(state.ran);
    let schedule = whole;
    let prepared = preparedFor(context, whole);
    if (prepared.placement !== state.placement) {
        prepared.placement = state.placement;
        prepared.tailing = state.channels.length === 0 ? null : tailingOf(context, whole);
    }
    const { tailing } = prepared;
    if (tailing !== null) {
        schedule = tailing.schedule;
        prepared = preparedFor(context, schedule);
    }
    let folds: Map<unknown, Fold> | null = null;
    if (schedule.reductions.size !== 0) for (const [key, contributors] of schedule.reductions) (folds ??= new Map()).set(key, { target: null, values: [], remaining: contributors, ran: false, failed: false });
    const { outcome } = prepared;
    prepared.warningCount = 0;
    outcome.failures = null;
    outcome.skipped = null;
    if (state.gpu !== null || tailing !== null || state.tails.length !== 0 || state.observer.posts.length !== 0) return executeFrom(context, schedule, prepared, folds, args, tailing, 0, null, null);
    let handed: Promise<RunReport> | null = null;
    let dropped = 0;
    try {
        for (let t = 0; t < schedule.tiers.length; t++) {
            // A tick in progress takes up runners replaced since it started from its next tier on.
            if (prepared.version !== state.runnersVersion) refresh(context, schedule, prepared);
            if (prepared.remotes[t] !== 0 || state.tails.length !== 0 || state.observer.posts.length !== 0) return handed = executeFrom(context, schedule, prepared, folds, args, null, t, null, null);
            const uses = prepared.uses[t];
            if (uses.length !== 0) {
                const building = refreshUses(state, uses, workers?.pool ?? null);
                if (building !== null) return handed = executeFrom(context, schedule, prepared, folds, args, null, t, building, null);
                if (state.indexFailures.length !== 0) (outcome.failures ??= []).push(...state.indexFailures.splice(0));
            }
            startTier(context, prepared, t, args);
            const waiting = settleTier(state, folds, prepared, schedule.tiers[t], t, nothing);
            if (waiting !== null) return handed = executeFrom(context, schedule, prepared, folds, args, null, t, null, waiting);
            if (endTier(state, null, prepared, schedule, t)) break;
        }
    }
    finally {
        if (handed === null) dropped = finishSync(context, prepared);
    }
    return reportOf(state, prepared, dropped);
};

/**
 * A run's sync point with nothing to wait for: no GPU, tails or observer posts, which `executeTiers` checked before
 * each tier and bodies can't add. Returns how many commands it dropped.
 */
const finishSync = (context: ExecuteContext, prepared: Prepared): number => {
    const { state, workers, publish } = context;
    const { outcome } = prepared;
    let dropped = 0;
    // This run's tasks on joined threads are done: they return to their event loops while its sync point applies.
    for (let k = 0; k < state.logs.length; k++) markRun(state.logs[k]);
    try {
        if (prepareSync(state)) {
            dropped = state.plan.dropped;
            for (const { finalizer, error, kind } of applySync(state)) (outcome.failures ??= []).push(failureOf(kind ?? "finalizer", finalizer, error));
        }
    }
    finally {
        // Strings let go before the last run's sync point have no reader left: this run's waited for every one.
        state.strings?.settle();
        rewind(state, workers);
        publish();
    }
    return dropped;
};

/**
 * `executeTiers` from tier `first` on, awaiting what it needs to: from the tier's start, or once `building`, its
 * indexes' build, is done, or once `settling`, what settling it waits for, settles.
 */
const executeFrom = async (context: ExecuteContext, schedule: Schedule, prepared: Prepared, folds: Map<unknown, Fold> | null, args: unknown, tailing: Tailing | null, first: number, building: Promise<void> | null, settling: Promise<Settled> | null): Promise<RunReport> => {
    const { state, workers, publish } = context;
    const { gpu } = state;
    const { outcome } = prepared;
    let built = building;
    let waited = settling;
    let dropped = 0;
    try {
        for (let t = first; t < schedule.tiers.length; t++) {
            const tier = schedule.tiers[t];
            if (waited === null) {
                if (built === null) {
                    // A tick in progress takes up runners replaced since it started from its next tier on.
                    if (prepared.version !== state.runnersVersion) refresh(context, schedule, prepared);
                    const runners = prepared.runners[t];
                    if (state.tails.length !== 0) {
                        const waiting = settleRunners(state, runners);
                        if (waiting !== null) await waiting;
                    }
                    if (state.observer.posts.length !== 0) {
                        const waiting = settleObserverRunners(state, runners);
                        if (waiting !== null) await waiting;
                    }
                    const uses = prepared.uses[t];
                    if (uses.length !== 0) {
                        const refreshing = refreshUses(state, uses, workers?.pool ?? null);
                        if (refreshing !== null) await refreshing;
                        if (state.indexFailures.length !== 0) (outcome.failures ??= []).push(...state.indexFailures.splice(0));
                    }
                }
                else {
                    await built;
                    built = null;
                    if (state.indexFailures.length !== 0) (outcome.failures ??= []).push(...state.indexFailures.splice(0));
                }
                const runners = prepared.runners[t];
                const remote = prepared.remotes[t];
                const only = remote === runners.length ? runners[0]?.remote?.channel : undefined;
                if (only !== undefined && allOn(runners, only)) {
                    const last = await runFused(context, schedule, prepared, folds, args, t, only);
                    if (last < 0) break;
                    t = last;
                    continue;
                }
                if (gpu !== null) await readAhead(state, gpu, runners);
                // Systems on joined threads start first, so their threads run while this one does.
                if (remote > 0) {
                    const { tasks } = prepared;
                    tasks.clear();
                    for (let i = 0; i < runners.length; i++) {
                        const channel = runners[i].remote?.channel;
                        if (channel === undefined || tasks.has(channel)) continue;
                        if (channel.busy()) await channel.idle();
                        gather(prepared, runners, channel, 0);
                        tasks.set(channel, post(state, prepared, channel, args));
                    }
                }
                startTier(context, prepared, t, args);
            }
            let value: Settled = nothing;
            if (waited !== null) {
                value = await waited;
                waited = null;
            }
            let waiting = settleTier(state, folds, prepared, tier, t, value);
            while (waiting !== null) waiting = settleTier(state, folds, prepared, tier, t, await waiting);
            if (endTier(state, gpu, prepared, schedule, t)) break;
        }
    }
    finally {
        // This run's tasks on joined threads are done: they return to their event loops while its sync point applies.
        for (let k = 0; k < state.logs.length; k++) markRun(state.logs[k]);
        try {
            if (gpu !== null) {
                gpu.submit();
                gpu.beforeSync();
            }
            try {
                // A sync point counts as a write to everything a tail still reads.
                if (state.tails.length !== 0) {
                    activate(state);
                    const waiting = syncPending(state) ? settleAll(state) : null;
                    if (waiting !== null) await waiting;
                }
                // Each sync point waits for observer systems on joined threads in progress, and cancels the rest.
                if (state.observer.posts.length !== 0) {
                    const waiting = settlePosts(state);
                    if (waiting !== null) await waiting;
                }
                if (prepareSync(state)) {
                    try {
                        if (gpu !== null) {
                            // The sync point moves and writes existing rows of these archetypes on the CPU, and
                            // finalizers read them, so it needs the GPU's writes there first.
                            const disturbed = disturbedBy(state);
                            gpu.disturb(disturbed.archetypes);
                            if (gpu.anyAhead()) await gpu.readback(disturbed.storages);
                        }
                    }
                    finally {
                        // Applied even when the readback fails, which only a lost device makes it do: the CPU state
                        // stays whole.
                        dropped = state.plan.dropped;
                        for (const { finalizer, error, kind } of applySync(state)) (outcome.failures ??= []).push(failureOf(kind ?? "finalizer", finalizer, error));
                    }
                }
            }
            finally {
                // Even a sync point that failed partway moved rows.
                if (gpu !== null && state.touched !== null) {
                    gpu.touched(state.touched);
                    state.touched.clear();
                }
            }
        }
        finally {
            // Strings let go before the last run's sync point have no reader left: this run's waited for every one.
            state.strings?.settle();
            rewind(state, workers);
            publish();
        }
    }
    if (tailing !== null) {
        // Placed again since, as when a joined thread is gone: they're found again next run.
        if (tailing.runners.some((runner, k) => runner !== context.runnerOf(tailing.leaves[k]))) prepared.placement = -1;
        else {
            if (gpu !== null) await readAhead(state, gpu, tailing.runners);
            // A thread runs one task at a time: the last tick's tail there, if it's still running, first.
            for (const runner of tailing.runners) if (runner.remote?.channel.busy() === true) await runner.remote.channel.idle();
            context.tails = postTails(state, tailing.runners, tailing.leaves, tailing.tiers, args);
            countRan(state, tailing.runners);
        }
    }
    return reportOf(state, prepared, dropped);
};

/** A run's report once its sync point applied, its index conflicts included: a shared one when nothing went wrong. */
const reportOf = (state: State, prepared: Prepared, dropped: number): RunReport => {
    const { outcome } = prepared;
    // Conflicts unique indexes found while refreshing for finalizers.
    if (state.indexFailures.length !== 0) (outcome.failures ??= []).push(...state.indexFailures.splice(0));
    const { failures, skipped } = outcome;
    // Released for collection: the next run starts them again.
    outcome.failures = outcome.skipped = null;
    const { warningCount } = prepared;
    if (failures === null && skipped === null && dropped === 0) return warningCount === 0 ? clean : warnedReport(prepared);
    return { failures: failures ?? none, skipped: skipped ?? none, dropped, warnings: warningCount === 0 ? none : prepared.warnings.slice(0, warningCount) };
};

/** A report of warnings alone: the last one made, while a run's warnings are the same, so a steady run allocates none. */
const warnedReport = (prepared: Prepared): RunReport => {
    const { warnings, warningCount, warned } = prepared;
    if (warned !== null && warned.warnings.length === warningCount) {
        let same = true;
        for (let k = 0; k < warningCount && same; k++) same = warned.warnings[k] === warnings[k];
        if (same) return warned;
    }
    return prepared.warned = { failures: none, skipped: none, dropped: 0, warnings: warnings.slice(0, warningCount) };
};

/**
 * What the planned sync point disturbs: the archetypes whose existing rows it moves or writes, those of every planned
 * entity that existed before it, and the resource entity's when finalizers run; and every storage it reads, theirs
 * and those finalizers look up. Spawns only add rows at the end of their archetypes.
 */
const disturbedBy = (state: State): { readonly archetypes: Set<Archetype>; readonly storages: readonly Storage[] } => {
    const { plan, archetypes } = state;
    const disturbed = new Set<Archetype>();
    for (let entry = 0; entry < plan.count; entry++) if (plan.from[entry] >= 0) disturbed.add(archetypes[plan.from[entry]]);
    const looked = new Set<number>();
    if (state.finalizers.length > 0) {
        const index = state.resourceEntity < 0 ? -1 : locate(state.entities, state.resourceEntity);
        if (index >= 0) disturbed.add(archetypes[state.entities.archetype[index]]);
        for (const { finalizer } of state.finalizers) {
            for (const name in finalizer.declaration.lookup) for (const key of finalizer.declaration.lookup[name].read ?? []) looked.add(idOf(state, key));
        }
    }
    const storages = [...disturbed].flatMap(archetype => archetype.storages);
    if (looked.size > 0) for (const archetype of archetypes) for (const id of looked) {
        const storage = archetype.storageById[id];
        if (storage !== undefined && !disturbed.has(archetype)) storages.push(storage);
    }
    return { archetypes: disturbed, storages };
};

/** Before CPU systems read or write a storage, in their query or through a lookup, the GPU's writes to it come back. */
export const readAhead = async (state: State, gpu: GpuEngine, runners: readonly Runner[]): Promise<void> => {
    if (!gpu.anyAhead()) return;
    const storages = new Set<Storage>();
    const add = (archetype: Archetype, ids: readonly number[]): void => {
        for (const id of ids) {
            const storage = archetype.storageById[id];
            if (storage !== undefined && gpu.isAhead(storage)) storages.add(storage);
        }
    };
    for (const runner of runners) {
        if (runner.placement !== "cpu") continue;
        for (const archetype of runner.matched()) add(archetype, runner.touches);
        if (runner.looks.length > 0) for (const archetype of state.archetypes) add(archetype, runner.looks);
        // What its indexes hold entities by, so they're kept by the values the GPU wrote.
        for (const { index } of runner.indexes) for (const archetype of state.archetypes) {
            add(archetype, index.keys);
            add(archetype, index.has);
        }
    }
    if (storages.size === 0) return;
    if (state.tails.length !== 0) {
        const waiting = settleKeys(state, [...storages].map(storage => storage.component), []);
        if (waiting !== null) await waiting;
    }
    if (state.observer.posts.length !== 0) {
        const waiting = settleObserverKeys(state, [...storages].map(storage => storage.component), []);
        if (waiting !== null) await waiting;
    }
    await gpu.readback([...storages]);
};

/**
 * CPU writes make GPU copies out of date; GPU kernels mark their own writes as they dispatch. Writes to a component
 * held on the GPU stamp its chunks, which uploads read, so only other storages are marked whole.
 */
const markWrites = (state: State, gpu: GpuEngine, runners: readonly Runner[]): void => {
    for (const runner of runners) {
        if (runner.placement !== "cpu" || runner.writes.length === 0) continue;
        for (const archetype of runner.matched()) {
            for (const id of runner.writes) {
                const storage = archetype.storageById[id];
                if (storage !== undefined && !(storage.ticked && state.resident.has(id))) gpu.markCpuWrites(archetype, storage);
            }
        }
    }
};
