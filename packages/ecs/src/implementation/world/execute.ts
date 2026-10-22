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
import type { Failure, Warning } from '../../interface/report/failure.js';
import type { RunReport } from './failures.js';
import { liftColumnStamps, type RemoteSystem, type TaskChannel } from './remote-systems.js';
import { failureOf } from './failures.js';
import { checkCommands } from './remote.js';
import { firstKeyOf, labelOfItem } from '../../interface/registry/index.js';
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
    /**
     * Given what went wrong before a run's sync point, each list null or a count of none, queues what its report needs
     * for them into that sync point.
     */
    readonly beforeSync: (failures: readonly Failure[] | null, skipped: readonly string[] | null, warnings: readonly Warning[], warningCount: number) => void;
};

/**
 * Runs a schedule tier by tier, then applies one sync point, and reports what went wrong. Within a tier, kernels start
 * first so workers run while main-thread systems do; commands merge in tier order, then chunk order, whichever thread
 * ran them. A failing system stops the run after its tier finishes: later tiers are skipped, and commands so far still
 * apply. `system` is the one the run was given, which the GPU's errors are reported under.
 */
export const execute = async (context: ExecuteContext, schedule: Schedule, args: unknown, system: { readonly name: string }): Promise<RunReport> => {
    const { gpu } = context.state;
    if (gpu === null) return executeTiers(context, schedule, args, null);
    const lost = gpu.lost();
    // Lost since the run started; the world sets gpuDevice to null before the next one.
    if (lost !== null) throw new Error(`The world's GPU device was lost during this run: ${lost}.`);
    // An earlier run's GPU work reports its errors to this run: waiting for them there would hold every run until the
    // GPU process catches up.
    const earlier = gpu.takeError();
    const failures = earlier === null ? null : [failureOf("gpu", earlier.name, earlier.message)];
    gpu.device.pushErrorScope("out-of-memory");
    gpu.device.pushErrorScope("validation");
    try {
        return await executeTiers(context, schedule, args, failures);
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

type Outcome = { failures: Failure[] | null; skipped: string[] | null };
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
            placement: -1, tailing: null,
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
const settled = (state: State, folds: ReadonlyMap<unknown, Fold> | null, outcome: Outcome, runner: Runner, leaf: { readonly name: string }, error: unknown): boolean => {
    if (error === gone) {
        const label = labelOfItem(leaf);
        (outcome.failures ??= []).push(failureOf("thread", label, runner.remote?.channel.goneError()));
        (outcome.skipped ??= []).push(label);
        if (folds !== null && runner.targets.length > 0) contribute(state, folds, runner, null, true);
        return false;
    }
    const failed = error !== undefined;
    if (failed) (outcome.failures ??= []).push(failureOf("system", labelOfItem(leaf), error));
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
            for (let later = v + 1; later < schedule.tiers.length; later++) for (const leaf of schedule.tiers[later]) (outcome.skipped ??= []).push(labelOfItem(leaf));
            return -1;
        }
    }
    return last;
};

const executeTiers = async (context: ExecuteContext, whole: Schedule, args: unknown, earlier: Failure[] | null): Promise<RunReport> => {
    const { state, kernelIndexOf, workers, publish } = context;
    const { gpu } = state;
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
    for (const [key, contributors] of schedule.reductions) (folds ??= new Map()).set(key, { target: null, values: [], remaining: contributors, ran: false, failed: false });
    let dropped = 0;
    const { outcome } = prepared;
    prepared.warningCount = 0;
    outcome.failures = earlier;
    outcome.skipped = null;
    try {
        for (let t = 0; t < schedule.tiers.length; t++) {
            const tier = schedule.tiers[t];
            // A tick in progress takes up runners replaced since it started from its next tier on.
            if (prepared.version !== state.runnersVersion) refresh(context, schedule, prepared);
            const runners = prepared.runners[t];
            const remote = prepared.remotes[t];
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
                const building = refreshUses(state, uses, workers?.pool ?? null);
                if (building !== null) await building;
                if (state.indexFailures.length !== 0) (outcome.failures ??= []).push(...state.indexFailures.splice(0));
            }
            const only = remote === runners.length ? runners[0]?.remote?.channel : undefined;
            if (only !== undefined && allOn(runners, only)) {
                const last = await runFused(context, schedule, prepared, folds, args, t, only);
                if (last < 0) break;
                t = last;
                continue;
            }
            const started = prepared.started[t];
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
            for (let i = 0; i < runners.length; i++) if (runners[i].kernel !== null) started[i] = runners[i].start(args, workers, kernelIndexOf(runners[i]));
            for (let i = 0; i < runners.length; i++) if (runners[i].kernel === null && runners[i].remote === null) started[i] = runners[i].start(args, null, -1);
            // Every chunk settles, even a failed one, so no worker is still writing at the sync point. Chunks the main
            // thread ran are settled already, so only those workers run are awaited.
            let tierFailed = false;
            for (let i = 0; i < runners.length; i++) {
                const runner = runners[i];
                const remoteSystem = runner.remote;
                if (remoteSystem !== null) {
                    if (settled(state, folds, outcome, runner, tier[i], settleRemote(state, remoteSystem, await (prepared.tasks.get(remoteSystem.channel) ?? notDone)))) tierFailed = true;
                    continue;
                }
                let error: unknown = undefined;
                // Indexed: an iterator kept across an await would be allocated for every system.
                const chunks = started[i];
                for (let c = 0; c < chunks.length; c++) {
                    const chunk = chunks[c];
                    const result = chunk instanceof Promise ? await chunk : chunk;
                    // Every chunk's commands queue, a failed system's included; its first error stands for it.
                    if (isResults(result)) for (const each of result) error = firstOf(error, queue(state, each));
                    else error = firstOf(error, queue(state, result));
                }
                started[i] = noChunks;
                const failed = error !== undefined;
                if (failed) {
                    (outcome.failures ??= []).push(failureOf("system", labelOfItem(tier[i]), error));
                    tierFailed = true;
                }
                if (folds !== null && runner.targets.length > 0) contribute(state, folds, runner, runner.finish(failed), failed);
            }
            if (remote > 0) prepared.tasks.clear();
            countRan(state, runners);
            if (gpu !== null) markWrites(state, gpu, runners);
            if (tierFailed) {
                for (let later = t + 1; later < schedule.tiers.length; later++) for (const leaf of schedule.tiers[later]) (outcome.skipped ??= []).push(labelOfItem(leaf));
                break;
            }
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
                // The report's errors known so far join this sync point.
                context.beforeSync(outcome.failures, outcome.skipped, prepared.warnings, prepared.warningCount);
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
                        for (const { finalizer, error, kind } of applySync(state)) (outcome.failures ??= []).push(failureOf(kind ?? "finalizer", labelOfItem(finalizer), error));
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
