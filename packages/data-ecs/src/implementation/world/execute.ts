import type { Leaf } from '../../interface/system/leaf.js';
import type { Chunk, ChunkResult, Runner, Workers } from './runner.js';
import type { Schedule } from '../../interface/registry/schedule.js';
import type { Archetype, Storage } from './archetype.js';
import { idOf, type State } from './state.js';
import type { GpuEngine } from './gpu.js';
import { applySync, prepareSync } from './synchronize.js';
import { locate } from './entities.js';
import { clearBuffer, createBuffer } from './buffer.js';
import { decodeSegment, type MergeTag, type Segment } from './command-ring.js';
import { viewsOf } from '../../interface/registry/layout.js';
import { combine, identityOf, writeReduction, type ReductionTarget } from './reductions.js';
import type { Failure, Report } from '../../interface/world/report.js';
import { failureOf } from './failures.js';
import { firstKeyOf, labelOfItem } from '../../interface/registry/index.js';

/** Shared by every report without failures or skipped systems: they're read-only, so none needs its own. */
const none: readonly never[] = [];
const noChunks: readonly Chunk[] = [];
/** The report of a run with nothing to report. */
const clean: Report = { failures: none, skipped: none, dropped: 0 };

export type ExecuteContext = {
    readonly state: State;
    readonly runnerOf: (leaf: Leaf) => Runner;
    readonly kernelIndexOf: (runner: Runner) => number;
    readonly workers: Workers | null;
    /** Tells workers about layout changes; called after the sync point. */
    readonly publish: () => void;
};

/**
 * Runs a schedule tier by tier, then applies one sync point, and reports what went wrong. Within a tier, kernels start
 * first so workers run while main-thread systems do; commands merge in tier order, then chunk order, whichever thread
 * ran them. A failing system stops the run after its tier finishes: later tiers are skipped, and commands so far still
 * apply. `system` is the one the run was given, which the GPU's errors are reported under.
 */
export const execute = async (context: ExecuteContext, schedule: Schedule, args: unknown, system: { readonly name: string }): Promise<Report> => {
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
type Prepared = { readonly runners: Runner[][]; readonly started: (readonly Chunk[])[][] };
const preparedBy = new WeakMap<ExecuteContext, WeakMap<Schedule, Prepared>>();

const preparedFor = (context: ExecuteContext, schedule: Schedule): Prepared => {
    let bySchedule = preparedBy.get(context);
    if (bySchedule === undefined) preparedBy.set(context, bySchedule = new WeakMap());
    let prepared = bySchedule.get(schedule);
    if (prepared === undefined) {
        prepared = { runners: schedule.tiers.map(tier => tier.map(context.runnerOf)), started: schedule.tiers.map(tier => new Array<readonly Chunk[]>(tier.length)) };
        bySchedule.set(schedule, prepared);
    }
    return prepared;
};

/**
 * Drains one part of a worker's segment into a buffer of its own, queued in its place: commands, spawn blocks staged
 * to commit in its place, and the reservations it left unused. With `tag`, the part must start with that merge tag.
 */
const drainPart = (state: State, bytes: Uint8Array, tag: MergeTag | null): boolean => {
    if (bytes.byteLength === 0) return true;
    const buffer = state.drains[state.drained] ??= createBuffer();
    state.drained++;
    if (!decodeSegment(buffer, viewsOf(bytes.buffer, bytes.byteOffset, bytes.byteLength), state.layouts, state.starts, state.unused, tag)) return false;
    // Systems can't touch the resource entity; only registration adds resources.
    if (buffer.count > 0 || buffer.stagedCount > 0) state.queued.push({ buffer, guarded: true });
    return true;
};

/** A segment's ring part, then its spill; the first part holding records starts with the task's merge tag. */
const drain = (state: State, { ring, spill, tag }: Segment): Error | undefined => {
    const drained = drainPart(state, ring, tag) && (spill === null || drainPart(state, spill, ring.byteLength === 0 ? tag : null));
    return drained ? undefined : new Error("A worker's commands came back under another task's merge tag.");
};

/** Queues a settled chunk's commands, a worker's drained from its segment, and returns its error, if it failed. */
const queue = (state: State, { commands, segment, error }: ChunkResult): unknown => {
    const drained = segment === undefined ? undefined : drain(state, segment);
    if (commands.count > 0 || commands.stagedCount > 0) state.queued.push({ buffer: commands, guarded: true });
    return error ?? drained;
};

/** Once a sync point applied or failed: empties the buffers workers' segments drained into, and their command rings. */
const rewind = (state: State, workers: Workers | null): void => {
    for (let k = 0; k < state.drained; k++) clearBuffer(state.drains[k]);
    state.drained = 0;
    workers?.pool.rewind();
};

const firstOf = (first: unknown, next: unknown): unknown => first === undefined ? next : first;

const isResults = (result: ChunkResult | readonly ChunkResult[]): result is readonly ChunkResult[] => Array.isArray(result);

const executeTiers = async (context: ExecuteContext, schedule: Schedule, args: unknown, earlier: Failure[] | null): Promise<Report> => {
    const { state, kernelIndexOf, workers, publish } = context;
    const { gpu } = state;
    const prepared = preparedFor(context, schedule);
    let folds: Map<unknown, Fold> | null = null;
    for (const [key, contributors] of schedule.reductions) (folds ??= new Map()).set(key, { target: null, values: [], remaining: contributors, ran: false, failed: false });
    // Allocated only when there's something to list.
    let failures = earlier;
    let skipped: string[] | null = null;
    let dropped = 0;
    try {
        for (let t = 0; t < schedule.tiers.length; t++) {
            const tier = schedule.tiers[t];
            const runners = prepared.runners[t];
            for (let i = 0; i < tier.length; i++) runners[i] = context.runnerOf(tier[i]);
            const started = prepared.started[t];
            if (gpu !== null) await readAhead(state, gpu, runners);
            for (let i = 0; i < runners.length; i++) if (runners[i].kernel !== null) started[i] = runners[i].start(args, workers, kernelIndexOf(runners[i]));
            for (let i = 0; i < runners.length; i++) if (runners[i].kernel === null) started[i] = runners[i].start(args, null, -1);
            // Every chunk settles, even a failed one, so no worker is still writing at the sync point. Chunks the main
            // thread ran are settled already, so only those workers run are awaited.
            let tierFailed = false;
            for (let i = 0; i < runners.length; i++) {
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
                if (failed) (failures ??= []).push(failureOf("system", labelOfItem(tier[i]), error));
                if (failed) tierFailed = true;
                const runner = runners[i];
                if (folds !== null && runner.targets.length > 0) contribute(state, folds, runner, runner.finish(failed), failed);
            }
            if (gpu !== null) markWrites(gpu, runners);
            if (tierFailed) {
                for (let later = t + 1; later < schedule.tiers.length; later++) for (const leaf of schedule.tiers[later]) (skipped ??= []).push(labelOfItem(leaf));
                break;
            }
        }
    }
    finally {
        try {
            if (gpu !== null) {
                gpu.submit();
                gpu.beforeSync();
            }
            try {
                if (prepareSync(state)) {
                    try {
                        if (gpu !== null) {
                            // The sync point moves and writes existing rows of these archetypes on the CPU, and finalizers read
                            // them, so it needs the GPU's writes there first.
                            const disturbed = disturbedBy(state);
                            gpu.disturb(disturbed.archetypes);
                            if (gpu.anyAhead()) await gpu.readback(disturbed.storages);
                        }
                    }
                    finally {
                        // Applied even when the readback fails, which only a lost device makes it do: the CPU state stays whole.
                        dropped = state.plan.dropped;
                        for (const { finalizer, error } of applySync(state)) (failures ??= []).push(failureOf("finalizer", labelOfItem(finalizer), error));
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
            rewind(state, workers);
            publish();
        }
    }
    return failures === null && skipped === null && dropped === 0 ? clean : { failures: failures ?? none, skipped: skipped ?? none, dropped };
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
const readAhead = async (state: State, gpu: GpuEngine, runners: readonly Runner[]): Promise<void> => {
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
    }
    if (storages.size > 0) await gpu.readback([...storages]);
};

/** CPU writes make GPU copies out of date; GPU kernels mark their own writes as they dispatch. */
const markWrites = (gpu: GpuEngine, runners: readonly Runner[]): void => {
    for (const runner of runners) {
        if (runner.placement !== "cpu" || runner.writes.length === 0) continue;
        for (const archetype of runner.matched()) {
            for (const id of runner.writes) {
                const storage = archetype.storageById[id];
                if (storage !== undefined) gpu.markCpuWrites(archetype, storage);
            }
        }
    }
};
