// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Finalizer } from '../../interface/finalizer/created.js';
import type { Rule } from '../../interface/rule/created.js';
import { requireDefinition, type Definition } from '../../interface/registry/index.js';
import type { World } from '../../interface/world/world.js';
import type { Input } from '../../interface/system/input.js';
import type { System } from '../../interface/system/system.js';
import type { Create, InitialResources } from '../../interface/world/create.js';
import type { Join } from '../../interface/world/join.js';
import { joinWorld } from './join.js';
import { createSharing, type ThreadProgress } from './sharing.js';
import { gpuDevice } from '../../interface/resources/gpu-device.js';
import { workers } from '../../interface/resources/workers.js';
import { createGpu } from './gpu.js';
import { readCell, writeCell } from './cells.js';
import { finalizeAll, refreshFinalizerIndexes, type Thrown } from './finalizers.js';
import { startWatches } from './indexes.js';
import { clean as cleanReport, execute, type ExecuteContext } from './execute.js';
import { errorOfRun, failureOf, type Failure, type RunReport } from './failures.js';
import { createOutOfBand } from './out-of-band.js';
import { startRan } from './state.js';
import { joinedIn, runObserver } from './observer.js';
import { awaitPost, joinedRunOf, postObserver, settlePosts, settleObserverKeys, type PostResult } from './joined-observer.js';
import type { Leaf } from '../../interface/system/leaf.js';
import { settleKeys, type TailOutcome } from './tails.js';
import { sharedMemoryAvailable } from './memory.js';
import { createPool, type Pool } from './pool.js';
import type { Runner } from './runner.js';
import { platformWorkers, type WorkerPlatform, type WorkerPort } from './worker-platform.js';
import { createPublisher } from './publish.js';
import { flushBetween } from './layout-directory.js';
import { refreshDirectories } from './directories.js';
import { createRegistrar, type Registration } from './register.js';
import type { Schedule } from '../../interface/registry/schedule.js';
import { ensureResources, findResource, initialOf, setResource } from './resources.js';
import { ensureProgramResources, activate, finalizerCrossing, placeFinalizers } from './activate.js';
import { isObserver, isWorldWritten, kindOf, programVersion, scheduleOf, type Composite } from '../../interface/registry/index.js';
import { always } from '../../interface/resources/always.js';
import { cadence, type Cadence } from '../../interface/resources/cadence.js';
import { clock } from '../../interface/resources/clock.js';
import { wake } from '../../interface/resources/wake.js';
import { stampChanged } from './archetype.js';
import { createLoop, platformFrame, platformTimer, type Clock, type LoopPlatform } from './loop.js';
import { presetLevelsOf } from './lists.js';
import { createState, defaultOf, idOf, reside, startTicking, type Key } from './state.js';
import { indexOf } from './entities.js';
import { touchedHeld } from './up.js';
import { isHeld } from './transfers.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import { labelOf, whyUnregistered } from '../../interface/registry/index.js';

type Queue = <T>(task: () => T | Promise<T>) => Promise<T>;

/** A task's failure as the queue's own chain carries it, which never rejects: made only when a task fails. */
type Carried = { readonly thrown: unknown };
const thrownValues = new WeakSet<object>();
const thrownOf = (error: unknown): Carried => {
    const wrapped = { thrown: error };
    thrownValues.add(wrapped);
    return wrapped;
};
const isThrown = (value: unknown): value is Carried => typeof value === "object" && value !== null && thrownValues.has(value);
/** What a task's caller gets: its value, or its failure thrown. */
const unwrap = (value: unknown): unknown => {
    if (isThrown(value)) throw value.thrown;
    return value;
};

/**
 * Runs tasks one at a time, in call order; a failed task doesn't block the next. The queue's own chain never rejects,
 * carrying a failure as a value, and the promise a task's caller holds is a second one, which nothing in the queue
 * handles, so a rejection nobody awaits is unhandled, whatever follows it. Tasks wait in order in an array, which one
 * shared step takes from, so queuing one makes no closure.
 */
const createQueue = (): Queue => {
    let tail: Promise<unknown> = Promise.resolve();
    const tasks: ((() => unknown) | undefined)[] = [];
    let count = 0;
    let next = 0;
    const step = (): unknown => {
        const k = next++;
        const task = tasks[k];
        // Let go, so the queue holds a task only until it starts; the slots past the last are reused.
        tasks[k] = undefined;
        if (next === count) next = count = 0;
        if (task === undefined) return undefined;
        try {
            const value = task();
            return value instanceof Promise ? value.then(undefined, thrownOf) : value;
        }
        catch (error) {
            return thrownOf(error);
        }
    };
    return <T>(task: () => T | Promise<T>): Promise<T> => {
        tasks[count++] = task;
        const settled = tail.then(step);
        tail = settled;
        // What `unwrap` gives is the task's own value, a `T`, or it throws.
        return settled.then(unwrap) as Promise<T>;
    };
};

/**
 * For tests and benchmarks: the chunk size kernels split at, whether kernels may use WASM and SIMD, the loop's
 * platform, such as `backToBack()` for ticks as fast as tasks run, and where pool workers come from, such as
 * `lentWorkers(...)` for workers another thread lent, or null for none; the platform's by default.
 */
export type WorldOptions = {
    readonly minimumChunk?: number;
    readonly wasm?: boolean;
    readonly simd?: boolean;
    readonly loop?: Partial<LoopPlatform>;
    readonly pool?: WorkerPlatform | null;
};

/**
 * How much a world holds, by table, for tests that what a system holds lives only as long as it: on the world's
 * thread, and on each pool worker.
 */
export type Tables = {
    readonly schedules: number;
    readonly runners: number;
    readonly kernels: number;
    readonly observed: number;
    readonly afterSync: number;
    readonly directories: number;
    /** Indexes it keeps, for some registered system or finalizer, and how many builds of them ran in phases, and across the pool. */
    readonly indexes: number;
    readonly phasedBuilds: number;
    readonly pooledBuilds: number;
    readonly journalReaders: number;
    /** Entities filtered `up`s were told changed, held until their next run. */
    readonly touched: number;
    /** Bytes the arena holds. */
    readonly arena: number;
    /** Archetypes it made. */
    readonly archetypes: number;
    /**
     * Of shared values (`reclaim.ts`): archetypes reclaimed and waiting for reuse, how many times one was reclaimed or
     * reused, values interned, spawn batches, and levels of spawners with constants.
     */
    readonly sharing: { readonly pooled: number; readonly membership: number; readonly values: number; readonly batches: number; readonly presets: number };
    /** By joined thread with claims: how many indexes there hold a system, or are held until it drops one. */
    readonly joined: readonly number[];
    /** GPU records and index blocks, 0 without a device. */
    readonly gpu: number;
    readonly workers: readonly { readonly kernels: number }[];
};

/**
 * A world as the implementation gives it, for tests and benchmarks: also `threads`, each shared thread's progress in
 * the order they were shared, and `tables`, how much it holds, which the interface leaves out.
 */
export type CreatedWorld = World & { readonly threads: (notify: (value: readonly ThreadProgress[]) => void) => () => void; readonly tables: () => Promise<Tables> };

/** For tests: what a run or tick went through: what went wrong, and what it ran, where. */
export type Outcome = RunReport & {
    readonly systems: number;
    readonly workers: number;
    readonly joined: number;
    readonly main: boolean;
    readonly gpu: boolean;
};

/**
 * For tests: by the promise a run returned, its outcome once its systems ran, null until then and for one that failed
 * before they did; listeners each told every run's, joined threads' included, as it settles; and listeners each told a
 * tick's once its tails are done.
 */
export type Recorder = {
    readonly runs: WeakMap<Promise<unknown>, { outcome: Outcome | null }>;
    readonly each: ((outcome: Outcome) => void)[];
    readonly ticks: ((outcome: Outcome) => void)[];
};

const recorders = new WeakMap<World, () => Recorder>();

/** For tests: a world's recorder of outcomes, which it keeps from the first call on. */
export const recorderOf = (world: World): Recorder => {
    const start = recorders.get(world);
    if (start === undefined) throw new Error("Only a world createWorld made records outcomes.");
    return start();
};

/** What a world holds of shared values, for `tables`. */
const sharingHeld = (state: ReturnType<typeof createState>): Tables["sharing"] => {
    let pooled = 0;
    for (const pool of state.pools.values()) pooled += pool.length;
    let values = 0;
    for (const interned of state.shared) values += interned?.byText.size ?? 0;
    let presets = 0;
    for (const shape of state.shapes) presets += presetLevelsOf(shape);
    return { pooled, membership: state.membership.base + state.membership.log.length, values, batches: state.batches.length, presets };
};

const tickers = new WeakMap<World, (tick: number) => void>();

/** For tests: moves a world's tick on to `tick` before it ran anything, as a long-running world's would be. */
export const startTicksAt = (world: World, tick: number): void => {
    const start = tickers.get(world);
    if (start === undefined) throw new Error("Only a world createWorld made starts its ticks elsewhere.");
    start(tick);
};

/** What fails starting the pool: the workers, always the same subject, so a pool failing again isn't reported again. */
const poolWorkers = { name: "workers", id: null };

/** The loop's state, added to a world when its first tick runs. */
const loopResources: readonly Key[] = [cadence, always, wake, clock];

/**
 * Loads kernels, rejecting with the first failure only once every load has settled, so none finishes after the
 * registration it belonged to rolled back.
 */
const loadAll = async (runners: readonly Runner[]): Promise<void> => {
    const settled = await Promise.allSettled(runners.map(runner => runner.load()));
    for (const result of settled) if (result.status === "rejected") throw result.reason;
};

/** A pool size from the `workers` resource: the platform's for null, else a whole number, at least 0. */
const workersOf = (platform: WorkerPlatform, value: unknown): number =>
    value === null ? platform.count : typeof value === "number" && value > 0 ? Math.floor(value) : 0;

/** Rows below which a kernel's archetype runs on the main thread rather than paying for a round trip. */
const defaultMinimumChunk = 16384;

/** A report with more failures, or the same report without any. */
const withFailures = (report: RunReport, failures: readonly Failure[] | null): RunReport =>
    failures === null ? report : { ...report, failures: [...report.failures, ...failures] };

/** A report with its tails' failures and skipped systems. */
const withTails = (report: RunReport, { failures, skipped }: TailOutcome): RunReport => failures === null && skipped === null ? report : {
    ...report, failures: failures === null ? report.failures : [...report.failures, ...failures], skipped: skipped === null ? report.skipped : [...report.skipped, ...skipped],
};

/** A list, or null for an empty one. */
const listed = <T>(list: readonly T[]): readonly T[] | null => list.length === 0 ? null : list;

/** Whether `subject` is what one of `failures` failed. */
const failedIn = (failures: readonly Failure[] | null, subject: object): boolean => failures !== null && failures.some(failure => failure.subject === subject);

/** What no joined thread gave a run: its value is its runner's. */
const nothingThere = Symbol("nothing there");

/** Creates a world on this thread, as `World.create` does, with options for tests and benchmarks. */
export const createWorld = (resources: InitialResources = {}, options: WorldOptions = {}): CreatedWorld => {
    const shared = sharedMemoryAvailable();
    const initial = new Map<Key, unknown>();
    // String keys are never a resource's, so they're ignored, as commands ignore them.
    for (const key of Object.getOwnPropertySymbols(resources)) {
        if (kindOf(key) !== "resource") throw new Error(`"${labelOf(key)}" isn't a registered resource: ${whyUnregistered(key)}.`);
        if (isWorldWritten(key)) throw new Error(`"${labelOf(key)}" is written only by the world.`);
        initial.set(key, Reflect.get(resources, key));
    }
    const device = resources[gpuDevice] ?? null;
    const state = createState(shared, options.wasm ?? true, options.simd ?? true, device !== null, initial);
    const outOfBand = createOutOfBand();
    if (device !== null) state.gpu = createGpu(device, outOfBand);
    const registrar = createRegistrar(state);
    const enqueue = createQueue();
    /** Where pool workers come from; none without shared memory. */
    const platform = shared ? options.pool === undefined ? platformWorkers() : options.pool : null;
    let workerCount = platform === null ? 0 : workersOf(platform, initialOf(state, workers));
    state.workers = workerCount;
    /** Workers start with the first kernel, so worlds without kernels never spawn any. */
    let pool: Pool | null = null;
    const context: { -readonly [K in keyof ExecuteContext]: ExecuteContext[K] } = {
        state, runnerOf: registrar.runnerOf, kernelIndexOf: registrar.kernelIndexOf, workers: null, publish: () => {}, tails: null,
    };

    /** Waits for every joined thread's task in flight, as a tail may be, before what moves rows a tail may still read. */
    const drainTails = async (): Promise<void> => {
        while (state.channels.some(channel => channel.busy())) await Promise.all(state.channels.map(channel => channel.idle()));
        // Observer systems on joined threads: those in progress finish, the rest are cancelled, owed runs posted again
        // after.
        if (state.observer.posts.length !== 0) await settlePosts(state, true);
    };
    let disposed = false;
    const ensured = { version: -1 };

    const minimumChunk = options.minimumChunk ?? defaultMinimumChunk;

    /** Starts the pool with as many of the wanted workers as the platform has, or none: then kernels run here. */
    const startPool = (): Pool | null => {
        const ports: WorkerPort[] = [];
        while (platform !== null && ports.length < workerCount) {
            const port = platform.start();
            if (port === null) break;
            ports.push(port);
        }
        workerCount = state.workers = ports.length;
        if (ports.length === 0) {
            followPoolThreshold();
            return null;
        }
        const started = createPool(ports, state.memory);
        pool = started;
        context.workers = { pool: started, minimumChunk, next: 0 };
        context.publish = createPublisher(state, started);
        followPoolThreshold();
        return started;
    };

    /**
     * Whether a kernel loaded here since workers last caught up, or workers lost their loads: only then may one be
     * behind, so runs of systems without kernels look at no kernel.
     */
    let workersBehind = false;

    /** Loads kernels here, rejecting with the first failure only once every load has settled; workers are then behind. */
    const load = (runners: readonly Runner[]): Promise<void> => {
        if (runners.length === 0) return Promise.resolve();
        workersBehind = true;
        return loadAll(runners);
    };

    /** Whether kernels failed to load on the workers a run started: then they run here, and no pool starts again. */
    let workersFailed = false;

    /** Whether an archetype a kernel matches has rows enough for workers, as kernels loading look before the pool starts. */
    const kernelsWarrant = (): boolean => {
        for (const runner of registrar.kernels()) for (const archetype of runner.matched()) if (archetype.count >= state.poolThreshold) return true;
        return false;
    };

    /** Lets kernels running here want the pool, at half a piece, while one could start; once started, none want it. */
    const followPoolThreshold = (): void => {
        state.poolThreshold = pool === null && workerCount > 0 && !workersFailed ? minimumChunk / 2 : Infinity;
        state.poolWanted = false;
    };
    followPoolThreshold();

    /**
     * Starts the pool after a run whose kernel ran here over rows enough for workers. Kernels failing to load on it are
     * reported out of band, and the pool ends, so kernels run here from then on rather than every
     * run trying again.
     */
    const startWorkers = async (): Promise<void> => {
        try {
            await loadOnWorkers();
        }
        catch (error) {
            workersFailed = true;
            workersBehind = false;
            const failed = pool;
            pool = null;
            context.workers = null;
            context.publish = () => {};
            for (const runner of registrar.kernels()) runner.kernel?.unloadedOnWorkers();
            if (failed !== null) void failed.terminate();
            outOfBand.report(failureOf("workers", poolWorkers, error));
        }
        followPoolThreshold();
    };

    /**
     * Gives workers every kernel whose main-thread load is newer than theirs, including ones a failed registration
     * reloaded, starting the pool once a kernel ran here over rows enough for workers.
     */
    const loadOnWorkers = async (): Promise<void> => {
        if (workerCount === 0 || !workersBehind || (pool === null && !state.poolWanted && !kernelsWarrant())) return;
        const behind = registrar.kernels().filter(runner => runner.kernel?.staleOnWorkers() === true);
        if (behind.length === 0) {
            workersBehind = false;
            return;
        }
        const workers = pool ?? startPool();
        if (workers === null) return;
        context.publish();
        const setups = behind.flatMap(runner => runner.setup(registrar.kernelIndexOf(runner)) ?? []);
        const results = await Promise.all(Array.from({ length: workers.size }, (_, worker) => workers.request(worker, { kind: "kernels", kernels: setups })));
        const failed = results.find(result => result.error !== undefined);
        if (failed?.error !== undefined) throw failed.error;
        for (const runner of behind) runner.kernel?.loadedOnWorkers();
        workersBehind = false;
    };

    /**
     * Between runs, once tick arrays started: WASM lookups' directories, joined threads and workers see them before the
     * next run's tasks. Joined threads read the layout directory with or without a pool.
     */
    const publishLayouts = (): void => {
        refreshDirectories(state);
        flushBetween(state.directory, state.bumped, state.archetypes, state.entities, state.resourceEntity, state.counted);
        context.publish();
    };

    /** Adds resources, then loads kernels on the main thread and in every worker. Undoes the registration if loading fails. */
    const complete = async (registration: Registration): Promise<void> => {
        const { resources, ticked, resident, kernels } = registration;
        try {
            await drainTails();
            ensureResources(state, resources);
            // Kept after a rollback: ticks nothing reads cost only memory.
            startTicking(state, ticked);
            const residing = reside(state, resident);
            publishLayouts();
            await load(residing ? [...kernels, ...registrar.kernels().filter(runner => runner.kernel?.stale() === true && !kernels.includes(runner))] : kernels);
            await loadOnWorkers();
        }
        catch (error) {
            registration.rollback();
            throw error;
        }
    };

    /** Once indexes start kernels' stamps for more components: kernels that dropped them load again. */
    const reloadStamped = async (): Promise<void> => {
        publishLayouts();
        await load(registrar.kernels().filter(runner => runner.kernel?.stale() === true));
        await loadOnWorkers();
    };

    const checkLive = (): void => {
        if (disposed) throw new Error("The world is disposed.");
    };

    /** Pure: a resource no registered system uses still reads as its default. */
    const readResource = (key: Key): unknown => {
        const cell = findResource(state, key);
        return cell === undefined ? initialOf(state, key) : readCell(cell.storage, cell.row);
    };

    const deviceId = idOf(state, gpuDevice);
    const deviceDefault = defaultOf(gpuDevice);
    /** The `gpuDevice` resource's value, read each run, so without allocating. */
    const readDevice = (): ReadonlyResourceValue<typeof gpuDevice> => {
        const index = state.resourceEntity < 0 ? -1 : indexOf(state.resourceEntity);
        const storage = index < 0 ? undefined : state.archetypes[state.entities.archetype[index]]?.storageById[deviceId];
        const value = storage !== undefined ? readCell(storage, state.entities.row[index]) : state.initial.has(gpuDevice) ? state.initial.get(gpuDevice) : deviceDefault;
        // The resource's value matches its registered schema, `GPUDevice | null`.
        return value as ReadonlyResourceValue<typeof gpuDevice>;
    };

    /**
     * Before and after each run: the world's GPU storage follows its `gpuDevice` resource, which the world sets to null
     * once the device is lost. A new device gets the storage, after what's ahead on the old one is read back unless it
     * was lost; `kernel: "gpu"` systems move with it, and run on the CPU again without a device.
     */
    /** Whether the `gpuDevice` resource names another device than the world runs on; a lost device is no device. */
    const deviceChanged = (): boolean => {
        // Systems that need a device are then skipped, and systems watching it see the change.
        if (state.gpu !== null && state.gpu.lost() !== null && readDevice() === state.gpu.device) setResource(state, gpuDevice, null);
        return readDevice() !== (state.gpu?.device ?? null);
    };

    /** Moves the world onto the device `gpuDevice` names, or off the GPU. */
    const followDevice = async (): Promise<void> => {
        await drainTails();
        const device = readDevice();
        const current = state.gpu;
        if (current !== null) {
            // A lost device's copies are gone, so its readback keeps the CPU's.
            await current.readback();
            current.destroy();
        }
        state.gpu = device === null ? null : createGpu(device, outOfBand);
        state.touched = device === null ? null : new Set();
        await load(registrar.placeGpuKernels());
        await loadOnWorkers();
    };

    /** The `workers` resource's changed tick when the pool last followed it. */
    let workersSeen = -1;
    const workersId = idOf(state, workers);

    /** Whether the `workers` resource changed since the pool last followed it; allocates nothing. */
    const workersChanged = (): boolean => {
        if (state.resourceEntity < 0) return false;
        const index = indexOf(state.resourceEntity);
        const storage = state.archetypes[state.entities.archetype[index]]?.storageById[workersId];
        if (storage === undefined) return false;
        const changed = storage.changed[state.entities.row[index]];
        if (changed === workersSeen) return false;
        workersSeen = changed;
        return true;
    };

    /** Sizes the kernel pool to the `workers` resource: a new size starts a new pool, with the next kernel. */
    const followWorkers = async (): Promise<void> => {
        const wanted = platform === null ? 0 : workersOf(platform, readResource(workers));
        if (wanted === workerCount) return;
        workerCount = wanted;
        workersFailed = false;
        state.workers = wanted;
        const old = pool;
        pool = null;
        context.workers = null;
        context.publish = () => {};
        for (const runner of registrar.kernels()) runner.kernel?.unloadedOnWorkers();
        workersBehind = true;
        followPoolThreshold();
        // The old pool releases its control state once its workers have left their windows; runs don't wait for it.
        if (old !== null) void old.terminate();
        await loadOnWorkers();
    };

    /**
     * Whether a run of no tiers may skip its sync point: nothing is queued for it, and no GPU, joined thread or tail
     * needs what a sync point does for them.
     */
    const skipsSync = (): boolean => state.gpu === null && state.channels.length === 0 && state.tails.length === 0 && state.queued.length === 0 && state.observer.count === 0;

    /** Records outcomes for tests, from the first `recorderOf` call on; null until then, so runs gather nothing for it. */
    let recorder: Recorder | null = null;
    /** While recording, the records of runs queued, in order, and of the run in progress. */
    const records: { outcome: Outcome | null }[] = [];
    let record: { outcome: Outcome | null } | null = null;
    /** Takes the record of the run starting, the next queued, as each queued run starts in order. */
    const startRecord = (): void => {
        if (recorder !== null) record = records.shift() ?? null;
    };
    /** What a run or tick went through, for the recorder. */
    const outcomeOf = (report: RunReport): Outcome => {
        const { ran } = state;
        return { ...report, systems: ran.systems, workers: context.workers?.pool.takePosted() ?? 0, joined: ran.joined.size, main: ran.main, gpu: ran.gpu };
    };

    /** A run's or tick's tails, which `execution` leaves here for its caller. */
    let tailing: Promise<TailOutcome> | null = null;

    /**
     * Runs a registered system or composite, its `schedule`, ending in a sync point, and gives what went wrong; its
     * tails are left in `tailing`. A run with nothing to wait for gives it at once, allocating no async frame; a step
     * that waits goes on, once that's done, in a function of its own.
     */
    const execution = (definition: Definition, value: unknown, schedule: Schedule): RunReport | Promise<RunReport> => {
        const preparing = prepareRun();
        if (preparing !== null) return executePrepared(preparing, definition, value, schedule);
        return executeRun(definition, value, schedule);
    };
    const executePrepared = async (preparing: Promise<void>, definition: Definition, value: unknown, schedule: Schedule): Promise<RunReport> => {
        await preparing;
        return executeRun(definition, value, schedule);
    };

    /** Follows what changed since the last run: program resources, change watches, workers and the device; null when nothing did. */
    const prepareRun = (): Promise<void> | null => {
        // Resources added between runs move the resource entity, whose structs a tail may still read.
        if (ensured.version !== programVersion() && (state.channels.length > 0 || state.observer.posts.length > 0)) return drainThenPrepare();
        ensureProgramResources(state, ensured);
        if (startWatches(state)) return followChanges(true, false);
        if (workersChanged()) return followChanges(false, true);
        if (deviceChanged()) return followChanges(false, false);
        return null;
    };
    const drainThenPrepare = async (): Promise<void> => {
        await drainTails();
        ensureProgramResources(state, ensured);
        await followChanges(startWatches(state), false);
    };
    /**
     * Reloads kernels for new stamps when `reload`, then follows the workers, when `workers` says a check found they
     * changed or a check now does, and the device.
     */
    const followChanges = async (reload: boolean, workers: boolean): Promise<void> => {
        if (reload) await reloadStamped();
        if (workers || workersChanged()) await followWorkers();
        if (deviceChanged()) await followDevice();
    };

    /** Runs its tiers and sync point, or for a run of observer systems alone with nothing to sync, only counts what it ran. */
    const executeRun = (definition: Definition, value: unknown, schedule: Schedule): RunReport | Promise<RunReport> => {
        // An input that moved to a joined thread runs only there: that thread went since, its claims with it.
        if (isHeld(value) && (definition.kind === "composite" || registrar.runnerOf(definition).remote?.channel !== value.channel)) {
            throw new Error(`System "${definition.name}": the run's input moved to a joined thread that's gone.`);
        }
        let report: RunReport | Promise<RunReport>;
        try {
            if (schedule.tiers.length === 0 && skipsSync()) {
                startRan(state.ran);
                report = cleanReport;
            }
            else report = execute(context, schedule, value, definition);
        }
        catch (error) {
            return executeFailed(error);
        }
        if (report instanceof Promise) return executing(report);
        return executed(report);
    };
    const executing = async (running: Promise<RunReport>): Promise<RunReport> => {
        let report: RunReport;
        try {
            report = await running;
        }
        catch (error) {
            return executeFailed(error);
        }
        return executed(report);
    };
    /** A run whose tiers or sync point threw: it follows the device all the same, then fails. */
    const executeFailed = async (error: unknown): Promise<never> => {
        context.tails = null;
        if (deviceChanged()) await followDevice();
        throw error;
    };

    /** Takes the run's tails, then follows the device and starts the pool when they changed or were asked for. */
    const executed = (report: RunReport): RunReport | Promise<RunReport> => {
        tailing = context.tails;
        context.tails = null;
        // A kernel that ran here over rows enough for workers asked for the pool, which the next run's kernels use.
        if (deviceChanged() || (state.poolWanted && workersBehind)) return following(report);
        return report;
    };
    const following = async (report: RunReport): Promise<RunReport> => {
        if (deviceChanged()) await followDevice();
        if (state.poolWanted && workersBehind) await startWorkers();
        return report;
    };

    /**
     * Runs a registered system or composite as `run` does: its tiers and sync point, then once its tails are done its
     * observer systems and those added; then gives what its per-run body returned, or throws naming what failed.
     * `registered` is its schedule as it was registered, which it runs if a system it holds was removed since, skipping
     * that system.
     */
    const perform = (definition: Definition, value: unknown, registered: Schedule | undefined): unknown => {
        state.wanted = definition.kind === "system" && definition.declaration.components === undefined ? definition : null;
        const schedule = registrar.registered(definition) ?? registered;
        if (schedule === undefined) throw new Error(`System "${definition.name}" didn't register.`);
        const report = execution(definition, value, schedule);
        if (report instanceof Promise) return performing(report, definition, value, schedule);
        return afterExecution(report, definition, value, schedule);
    };
    const performing = async (running: Promise<RunReport>, definition: Definition, value: unknown, schedule: Schedule): Promise<unknown> =>
        afterExecution(await running, definition, value, schedule);

    /** Waits for the run's tails, as a run ends once they have, then runs observer systems. */
    const afterExecution = (report: RunReport, definition: Definition, value: unknown, schedule: Schedule): unknown => {
        const tails = tailing;
        tailing = null;
        if (tails !== null) return afterTails(tails, report, definition, value, schedule);
        return passRun(report, definition, value, schedule);
    };
    const afterTails = async (tails: Promise<TailOutcome>, report: RunReport, definition: Definition, value: unknown, schedule: Schedule): Promise<unknown> =>
        passRun(withTails(report, await tails), definition, value, schedule);

    /**
     * Runs the run's observer systems and those added, then settles the run: once its own on joined threads ran there,
     * for a run of the world's, which a joined thread's run of its own doesn't wait for.
     */
    const passRun = (report: RunReport, definition: Definition, value: unknown, schedule: Schedule): unknown => {
        const run = joinedRunOf(value);
        const waits = run === 0 && state.observer.count !== 0 ? awaitThere(schedule.observer) : null;
        const passed = passObserver(schedule.observer, loop.observer(), run);
        if (waits !== null) return passingThere(passed, waits, report, definition, schedule);
        if (passed instanceof Promise) return passing(passed, report, definition, schedule);
        return settleRun(report, passed, definition, schedule, nothingThere);
    };
    const passing = async (passing: Promise<Failure[] | null>, report: RunReport, definition: Definition, schedule: Schedule): Promise<unknown> =>
        settleRun(report, await passing, definition, schedule, nothingThere);

    /** A run's own observer systems on joined threads, each with the wait for its post, registered before it's posted. */
    const awaitThere = (own: readonly Leaf[]): Promise<readonly [Leaf, PostResult]>[] | null => {
        let waits: Promise<readonly [Leaf, PostResult]>[] | null = null;
        for (const leaf of own) {
            const { joined } = registrar.runnerOf(leaf);
            if (joined !== null) (waits ??= []).push(awaitPost(state, joined, leaf === state.wanted).then((result): readonly [Leaf, PostResult] => [leaf, result]));
        }
        return waits;
    };
    /** How many runs wait for posts on joined threads, during which a post owed to one is posted again at once. */
    let waitingThere = 0;
    const passingThere = async (passing: Failure[] | null | Promise<Failure[] | null>, waits: readonly Promise<readonly [Leaf, PostResult]>[], report: RunReport, definition: Definition, schedule: Schedule): Promise<unknown> => {
        let passed: Failure[] | null;
        let results: readonly (readonly [Leaf, PostResult])[];
        waitingThere++;
        try {
            passed = passing instanceof Promise ? await passing : passing;
            results = await Promise.all(waits);
        }
        finally {
            waitingThere--;
        }
        let there: Failure[] | null = null;
        let given: unknown = nothingThere;
        for (const [leaf, result] of results) {
            if (result.error !== undefined) (there ??= []).push(failureOf(result.gone ? "thread" : "system", leaf, result.error));
            else if (leaf === state.wanted) given = result.value;
        }
        return settleRun(withFailures(report, there), passed, definition, schedule, given);
    };

    /**
     * Settles a run once its observer systems ran: what its own threw fails it, as does a unique index's conflict its
     * pass found, and what those added threw is reported out of band. Throws naming its failures, or gives what its
     * per-run body returned: `given` from a joined thread, or else its runner's.
     */
    const settleRun = (report: RunReport, passed: Failure[] | null, definition: Definition, schedule: Schedule, given: unknown): unknown => {
        let own: Failure[] | null = null;
        let added: Failure[] | null = null;
        if (passed !== null) {
            for (const failure of passed) {
                if (failure.kind === "index" || schedule.observer.some(leaf => leaf === failure.subject)) (own ??= []).push(failure);
                else (added ??= []).push(failure);
            }
        }
        endPass(loop.observer(), added);
        const settled = withFailures(report, own);
        if (recorder !== null) {
            const outcome = outcomeOf(settled);
            if (record !== null) record.outcome = outcome;
            for (const listener of recorder.each) listener(outcome);
        }
        const { wanted } = state;
        state.wanted = null;
        const value = wanted === null ? undefined : given !== nothingThere ? given : registrar.runnerOf(wanted).takeResult();
        if (settled.failures.length !== 0) throw errorOfRun(settled);
        return value;
    };

    /**
     * After a pass: what observer systems added threw is reported out of band, and those reported before that ran
     * their bodies in it without failing recovered.
     */
    const endPass = (added: readonly Leaf[], failures: readonly Failure[] | null): void => {
        outOfBand.reportAll(failures);
        if (outOfBand.size() === 0) return;
        for (const leaf of added) {
            if (outOfBand.has(leaf) && !failedIn(failures, leaf) && registrar.runnerOf(leaf).didRun()) outOfBand.recovered(leaf);
        }
    };

    const noLeaves: readonly Leaf[] = [];
    const none: readonly never[] = [];

    /**
     * Runs observer systems, the run's and those added, after a sync point, and posts those on joined threads, the
     * run's owed to joined run `run` (0 for none); returns the failures of those that ran here.
     */
    const passObserver = (own: readonly Leaf[], added: readonly Leaf[], run = 0): Failure[] | null | Promise<Failure[] | null> => {
        if (own.length === 0 && added.length === 0) return state.observer.pending.size === 0 ? null : postAfter(null, own, added, run);
        const ran = runObserver(context, own, added, null);
        if (state.observer.count === 0) return ran;
        return ran instanceof Promise ? ran.then(done => postAfter(done, own, added, run)) : postAfter(ran, own, added, run);
    };

    /** Posts observer systems on joined threads after those here ran, then gives `failures`. */
    const postAfter = (failures: Failure[] | null, own: readonly Leaf[], added: readonly Leaf[], run: number): Failure[] | null | Promise<Failure[] | null> => {
        const posting = postObserver(state, joinedIn(context, own, false), joinedIn(context, added, true), run, context.workers?.pool ?? null);
        return posting === null ? failures : posting.then(() => failures);
    };
    // A post owed to a run, cancelled outside a sync point, is posted again between runs.
    state.observer.again = () => {
        // A run waiting for a post holds the queue, so it's posted again at once.
        if (waitingThere > 0) {
            void postObserver(state, [], [], 0, context.workers?.pool ?? null);
            return;
        }
        void enqueue(async () => {
            if (disposed) return;
            const posting = postObserver(state, [], [], 0, context.workers?.pool ?? null);
            if (posting !== null) await posting;
        });
    };

    /**
     * Registers an observer system `add` was given: at once when it can register again as it was
     * (`Registrar.reregister`), otherwise before the next run, unless it was removed meanwhile; its failure is reported
     * out of band.
     */
    const registerObserver = (system: Leaf): void => {
        if (registrar.registered(system) !== undefined || registrar.reregister(system)) return;
        void enqueue(async () => {
            if (disposed || registrar.registered(system) !== undefined || !loop.observer().includes(system)) return;
            try {
                await complete(registrar.register(system));
            }
            catch (error) {
                outOfBand.report(failureOf("system", system, error));
            }
        });
    };

    /** Writes a resource only the world writes, stamped with a tick of its own so systems see it. */
    const writeOwn = (key: Key, value: unknown): void => {
        const cell = findResource(state, key);
        if (cell === undefined) return;
        writeCell(cell.storage, cell.row, value);
        stampChanged(cell.storage, cell.row, ++state.tick);
    };

    /**
     * Ends a tick once its tails are done: what failed is reported out of band, once per system while it keeps
     * failing; what was reported and ran its body in the tick without failing recovered, as did finalizers that ran
     * and indexes that found no conflict.
     */
    const endTick = (report: RunReport, schedule: Schedule | undefined, ran: Outcome | null): void => {
        const { failures } = report;
        outOfBand.reportAll(listed(failures));
        if (outOfBand.size() !== 0) {
            // A system a failed tier skipped didn't run, whatever its runner says of its last run.
            if (schedule !== undefined) for (const tier of schedule.tiers) for (const leaf of tier) {
                if (outOfBand.has(leaf) && !failedIn(failures, leaf) && !report.skipped.includes(leaf) && registrar.runnerOf(leaf).didRun()) outOfBand.recovered(leaf);
            }
            if (state.finalized !== null) for (const finalizer of state.finalized) if (!failedIn(failures, finalizer)) outOfBand.recovered(finalizer);
            outOfBand.indexesRecovered(failures);
        }
        // Finalizers' runs are followed only while one is reported.
        if (state.finalized !== null) state.finalized.clear();
        if (outOfBand.size() !== 0 || state.finalized !== null) state.finalized = outOfBand.reports("finalizer") ? state.finalized ?? new Set() : null;
        if (recorder !== null && ran !== null) {
            const outcome: Outcome = { ...ran, failures: report.failures, skipped: report.skipped, dropped: report.dropped, warnings: report.warnings };
            for (const listener of recorder.ticks) listener(outcome);
        }
    };

    /**
     * One tick: the clock, the added systems as one composite, then observer systems with the tick's values. Its
     * tails may still run while those do; what failed is reported out of band once they're done, and what observer
     * systems threw once they ran.
     */
    const tick = (_: Composite, clockValue: Clock): Promise<void> => enqueue(async () => {
        // What's added as the tick starts: systems removed since the loop asked for it aren't in it.
        const composite = loop.current();
        if (disposed || composite === null) return;
        state.wanted = null;
        let report: RunReport;
        let schedule: Schedule | undefined;
        try {
            if (registrar.registered(composite) === undefined) {
                ensureResources(state, loopResources);
                await complete(registrar.register(composite));
            }
            schedule = registrar.registered(composite);
            if (schedule === undefined) throw new Error(`System "${composite.name}" didn't register.`);
            if (state.tails.length !== 0) {
                const waiting = settleKeys(state, [], [clockId]);
                if (waiting !== null) await waiting;
            }
            if (state.observer.posts.length !== 0) {
                const waiting = settleObserverKeys(state, [], [clockId]);
                if (waiting !== null) await waiting;
            }
            writeOwn(clock, clockValue);
            report = await execution(composite, undefined, schedule);
        }
        catch (error) {
            startRan(state.ran);
            report = { failures: [failureOf("system", composite, error)], skipped: none, dropped: 0, warnings: none };
        }
        const ran = recorder === null ? null : outcomeOf(cleanReport);
        const tails = tailing;
        tailing = null;
        const ticked = schedule;
        if (tails === null) endTick(report, ticked, ran);
        else void tails.then(outcome => endTick(withTails(report, outcome), ticked, ran));
        if (disposed) return;
        const observer = loop.observer();
        const passed = passObserver(noLeaves, observer);
        endPass(observer, passed instanceof Promise ? await passed : passed);
    });
    const clockId = idOf(state, clock);

    const loop = createLoop({
        settings: () => {
            // Stored values match each resource's registered schema.
            const cadenceValue = readResource(cadence) as Cadence;
            return { cadence: cadenceValue, always: readResource(always) === true, wake: Number(readResource(wake)) };
        },
        tick,
        now: options.loop?.now ?? (() => performance.now()),
        frame: options.loop?.frame ?? platformFrame,
        timer: options.loop?.timer ?? platformTimer,
    });

    /** Runs a system or composite with its input, as `run` does. */
    const runWith = (system: { readonly name: string }, value: unknown): Promise<unknown> => {
        let registration: Registration | null = null;
        let definition: Definition | undefined;
        try {
            checkLive();
            definition = requireDefinition(system);
            // A system registers in the world the first time it runs here.
            if (registrar.registered(definition) === undefined) registration = registrar.register(definition);
        }
        catch (error) {
            return Promise.reject(error);
        }
        const ran = definition;
        const registering = registration;
        const schedule = registrar.registered(ran);
        // A run of observer systems alone doesn't wake the loop.
        if (scheduleOf(ran).tiers.length > 0) loop.arrived();
        if (registering !== null) return recorded(enqueue(() => registeredThenPerform(registering, ran, value, schedule)));
        // Runs of registered systems wait in order in these arrays, which `performNext` takes from, so queuing one
        // makes no closure.
        waitingDefinitions[waitingCount] = ran;
        waitingValues[waitingCount] = value;
        waitingSchedules[waitingCount] = schedule;
        waitingCount++;
        return recorded(enqueue(performNext));
    };
    /** While recording, queues a record for a run just queued, found by its promise. */
    const recorded = (running: Promise<unknown>): Promise<unknown> => {
        if (recorder === null) return running;
        const queued: { outcome: Outcome | null } = { outcome: null };
        records.push(queued);
        recorder.runs.set(running, queued);
        return running;
    };
    const registeredThenPerform = async (registering: Registration, definition: Definition, value: unknown, schedule: Schedule | undefined): Promise<unknown> => {
        startRecord();
        await complete(registering);
        return perform(definition, value, schedule);
    };
    /** Runs waiting in order, the first `waitingCount`; the slots past them are reused, never truncated. */
    const waitingDefinitions: (Definition | undefined)[] = [];
    const waitingValues: unknown[] = [];
    const waitingSchedules: (Schedule | undefined)[] = [];
    let waitingCount = 0;
    /** The next of them to run: the queue runs tasks in the order queued, so each `performNext` takes the next. */
    let nextWaiting = 0;
    const performNext = (): unknown => {
        startRecord();
        const k = nextWaiting++;
        const definition = waitingDefinitions[k];
        const value = waitingValues[k];
        const schedule = waitingSchedules[k];
        // Let go, so a run holds what it was given only until it starts.
        waitingDefinitions[k] = waitingValues[k] = waitingSchedules[k] = undefined;
        if (nextWaiting === waitingCount) nextWaiting = waitingCount = 0;
        if (definition === undefined) throw new Error("A run was taken that wasn't waiting.");
        return perform(definition, value, schedule);
    };

    const sharing = createSharing({
        state,
        run: runWith,
        report: failure => outOfBand.report(failure),
        crossing: (threads, imported) => registrar.crossing(threads, imported) ?? finalizerCrossing(threads, imported),
        placed: () => {
            registrar.place();
            placeFinalizers(state);
        },
        between: task => void enqueue(async () => {
            if (disposed) return;
            await drainTails();
            task();
        }),
        observer: {
            add: system => {
                if (!disposed) world.add(system);
            },
            remove: system => world.remove(system),
            drop: system => {
                world.remove(system);
                if (disposed) return;
                // One never added, kept for its runs, is forgotten too.
                const release = registrar.forget([system]);
                void enqueue(async () => release());
            },
        },
    });

    const world: CreatedWorld = {
        // A run gives what its system's body returned, `R` by the system's type.
        run: <I, R>(system: System<I, R>, ...input: Input<NoInfer<I>>) => runWith(system, input[0]) as Promise<R>,
        share: port => {
            if (disposed) return Promise.reject(new Error("The world is disposed."));
            if (!state.memory.shared) return Promise.reject(new Error("Without cross-origin isolation memory can't be shared, so no thread can join."));
            return sharing.share(port);
        },
        add: system => {
            checkLive();
            const definition = requireDefinition(system);
            loop.add(definition);
            if (isObserver(definition)) registerObserver(definition);
        },
        remove: system => {
            const definition = requireDefinition(system);
            if (disposed) return;
            const change = loop.remove(definition);
            if (change === null) return;
            let forgotten: readonly Definition[];
            if (isObserver(definition)) {
                // An observer system added alone, which the composite ticks run doesn't hold: forgotten unless an added
                // composite does.
                if (loop.observer().includes(definition)) return;
                forgotten = [definition];
            }
            else {
                // What's still added keeps its runners; the rest, the composite ticks ran included, is forgotten.
                const kept = new Set<Definition>(change.next === null ? [] : registrar.systemsOf(change.next));
                for (const leaf of loop.observer()) kept.add(leaf);
                forgotten = change.previous === null ? [] : registrar.systemsOf(change.previous).filter(each => !kept.has(each));
            }
            const release = registrar.forget(forgotten);
            // What they held goes once the run or tick in progress, which may still use it, is done.
            void enqueue(async () => release());
        },
        dispose: () => {
            disposed = true;
            loop.stop();
            return enqueue(async () => {
                // Runs queued before have reported what failed in them; nothing is reported from here on.
                outOfBand.close();
                // Joined threads' runs reject from here on.
                sharing.close();
                // Per-query finalizers release what every live entity they match holds, reading the GPU's writes first.
                let errors: Thrown[] = [];
                try {
                    // A finalizer added since the last run still releases what the world's entities hold.
                    ensureProgramResources(state, ensured);
                    activate(state);
                    if (state.finalizers.length > 0) {
                        if (state.gpu?.anyAhead() === true) await state.gpu.readback();
                        refreshFinalizerIndexes(state);
                        errors = finalizeAll(state);
                    }
                }
                finally {
                    state.gpu?.destroy();
                    await pool?.terminate();
                }
                if (errors.length > 0) throw errors[0].error;
            });
        },
        [Symbol.asyncDispose]: () => world.dispose(),
        threads: sharing.progress,
        tables: () => enqueue(async () => {
            const current: Pool | null = pool;
            const workers = current === null ? [] : await Promise.all(Array.from({ length: current.size }, (_, worker) => current.request(worker, { kind: "tables" })));
            return {
                ...registrar.sizes(),
                observed: state.observed.size,
                afterSync: state.afterSync.size,
                directories: state.directories.size,
                indexes: state.indexes.size,
                phasedBuilds: state.phasedBuilds,
                pooledBuilds: state.pooledBuilds,
                journalReaders: state.journal.readers,
                touched: touchedHeld(state),
                arena: state.memory.held(),
                archetypes: state.archetypes.length,
                sharing: sharingHeld(state),
                joined: state.channels.map(channel => channel.placed()),
                gpu: state.gpu?.records() ?? 0,
                workers: workers.map(result => ({ kernels: result.kernels ?? -1 })),
            };
        }),
    };
    recorders.set(world, () => recorder ??= { runs: new WeakMap(), each: [], ticks: [] });
    tickers.set(world, tick => {
        if (state.tick !== 0) throw new Error("A world starts its ticks elsewhere only before it ran anything.");
        state.tick = tick;
    });
    return world;
};

/**
 * Creates a world, with resources starting at these values in place of their defaults. With `gpuDevice`, render
 * systems and `kernel: "gpu"` kernels run on that device.
 */
export const create: Create = resources => createWorld(resources);

/** Joins a world another thread shared, through the other end of its port, as `joinWorld` does. */
export const join: Join = (port, options) => joinWorld(port, options);
