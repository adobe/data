// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Finalizer } from '../../interface/finalizer/created.js';
import type { Rule } from '../../interface/rule/created.js';
import { requireDefinition, type Definition } from '../../interface/registry/index.js';
import type { World } from '../../interface/world/world.js';
import type { Create, InitialResources } from '../../interface/world/create.js';
import type { Join } from '../../interface/world/join.js';
import type { Failure } from '../../interface/report/failure.js';
import { joinWorld } from './join.js';
import { createSharing, type ThreadProgress } from './sharing.js';
import { gpuDevice } from '../../interface/resources/gpu-device.js';
import { workers } from '../../interface/resources/workers.js';
import { createGpu } from './gpu.js';
import { readCell, writeCell } from './cells.js';
import { finalizeAll, refreshFinalizerIndexes, type Thrown } from './finalizers.js';
import { startWatches } from './indexes.js';
import { clean as cleanReport, execute, type ExecuteContext } from './execute.js';
import type { RunReport } from './failures.js';
import { createReports, type RunValues, type Slot } from './reports.js';
import { synchronizeAlone } from './synchronize.js';
import { startRan } from './state.js';
import type { CommandBuffer } from './buffer.js';
import { keysOf } from './remote-systems.js';
import { Report } from '../../interface/report/report.js';
import { joinedIn, runObserver } from './observer.js';
import { joinedRunOf, postObserver, settlePosts, settleObserverKeys } from './joined-observer.js';
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
import { firstKeyOf, isObserver, isWorldWritten, kindOf, orderKeysOf, programVersion, scheduleOf, type Composite } from '../../interface/registry/index.js';
import { always } from '../../interface/resources/always.js';
import { cadence, type Cadence } from '../../interface/resources/cadence.js';
import { clock } from '../../interface/resources/clock.js';
import { wake } from '../../interface/resources/wake.js';
import { stampChanged } from './archetype.js';
import { failureOf } from './failures.js';
import { createLoop, platformFrame, platformTimer, type Clock, type LoopPlatform } from './loop.js';
import { createState, defaultOf, idOf, reside, startTicking, type Key } from './state.js';
import { indexOf } from './entities.js';
import { isHeld } from './transfers.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import { labelOf } from '../../interface/registry/index.js';

type Queue = <T>(task: () => T | Promise<T>) => Promise<T>;

/** Runs tasks one at a time, in call order; a failed task doesn't block the next. */
const createQueue = (): Queue => {
    let tail: Promise<unknown> = Promise.resolve();
    return task => {
        const result = tail.then(task);
        tail = result.then(() => undefined, () => undefined);
        return result;
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
    /** Bytes the arena holds. */
    readonly arena: number;
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

/** Report components, by their first keys, for knowing which systems read reports. */
const reportKeys: ReadonlySet<Key> = new Set(Report.Archetype.map(firstKeyOf));

/** Whether leaves read reports: name a report component in their declarations, lookups or order. */
const readReports = (leaves: readonly Leaf[]): boolean =>
    leaves.some(leaf => [...keysOf(leaf), ...orderKeysOf(leaf.declaration)].some(key => reportKeys.has(firstKeyOf(key))));

/** Creates a world on this thread, as `World.create` does, with options for tests and benchmarks. */
export const createWorld = (resources: InitialResources = {}, options: WorldOptions = {}): CreatedWorld => {
    const shared = sharedMemoryAvailable();
    const initial = new Map<Key, unknown>();
    // String keys are never a resource's, so they're ignored, as commands ignore them.
    for (const key of Object.getOwnPropertySymbols(resources)) {
        if (kindOf(key) !== "resource") throw new Error(`"${labelOf(key)}" isn't a registered resource.`);
        if (isWorldWritten(key)) throw new Error(`"${labelOf(key)}" is written only by the world.`);
        initial.set(key, Reflect.get(resources, key));
    }
    const device = resources[gpuDevice] ?? null;
    const state = createState(shared, options.wasm ?? true, options.simd ?? true, device !== null, initial);
    if (device !== null) state.gpu = createGpu(device);
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
        beforeSync: (failures, skipped, warnings, warningCount) => reports.beforeSync(failures, skipped, warnings, warningCount),
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

    /** Starts the pool with as many of the wanted workers as the platform has, or none: then kernels run here. */
    const startPool = (): Pool | null => {
        const ports: WorkerPort[] = [];
        while (platform !== null && ports.length < workerCount) {
            const port = platform.start();
            if (port === null) break;
            ports.push(port);
        }
        workerCount = state.workers = ports.length;
        if (ports.length === 0) return null;
        const started = createPool(ports, state.memory);
        pool = started;
        context.workers = { pool: started, minimumChunk: options.minimumChunk ?? defaultMinimumChunk, next: 0 };
        context.publish = createPublisher(state, started);
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

    /** Gives workers every kernel whose main-thread load is newer than theirs, including ones a failed registration reloaded. */
    const loadOnWorkers = async (): Promise<void> => {
        if (workerCount === 0 || !workersBehind) return;
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
        state.gpu = device === null ? null : createGpu(device);
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
        state.workers = wanted;
        const old = pool;
        pool = null;
        context.workers = null;
        context.publish = () => {};
        for (const runner of registrar.kernels()) runner.kernel?.unloadedOnWorkers();
        workersBehind = true;
        // The old pool releases its control state once its workers have left their windows; runs don't wait for it.
        if (old !== null) void old.terminate();
        await loadOnWorkers();
    };

    /**
     * Whether a run of no tiers may skip its sync point: nothing is queued for it, and no GPU, joined thread or tail
     * needs what a sync point does for them.
     */
    const skipsSync = (): boolean => state.gpu === null && state.channels.length === 0 && state.tails.length === 0 && state.queued.length === 0 && state.observer.count === 0;

    /** Run numbers: every run and tick takes the next, in the order they run. */
    let runs = 0;
    /**
     * Commands of reports between runs, applied as a sync point of their own once observer systems on joined threads in
     * progress have finished; or, while tails run there, which a sync point between runs would disturb, queued for the
     * next run's or tick's.
     */
    const applyAlone = (buffer: CommandBuffer): Promise<void> | null => {
        if (state.tails.length !== 0) {
            state.queued.push({ buffer, guarded: false });
            return null;
        }
        const settling = state.observer.posts.length === 0 ? null : settlePosts(state, true);
        if (settling === null) {
            synchronizeAlone(state, buffer);
            publishLayouts();
            return null;
        }
        return settling.then(() => {
            if (disposed) return;
            synchronizeAlone(state, buffer);
            publishLayouts();
        });
    };
    const reports = createReports(state, applyAlone);
    const reportIds = [idOf(state, Report.run)];
    const noIds: readonly number[] = [];
    /** A tick's report, its slot and what it ran, which `perform` leaves without `pass`, with its tails in `tailing`. */
    let performed: RunReport = cleanReport;
    let performedSlot: Slot | null = null;
    let performedValues: RunValues | null = null;

    /** What the last run ran, for its report, reused run to run: a tick whose report waits for its tails copies it. */
    const ranValues: RunValues = { number: 0, elapsed: 0, systems: 0, workers: 0, joined: 0, main: false, gpu: false, dropped: 0 };
    /** What run `run` ran, gathered by its tiers, once its sync point is done, into `ranValues`. */
    const valuesOf = (run: number, started: number, dropped: number): RunValues => {
        const { ran } = state;
        ranValues.number = run;
        ranValues.elapsed = performance.now() - started;
        ranValues.systems = ran.systems;
        ranValues.workers = context.workers?.pool.takePosted() ?? 0;
        ranValues.joined = ran.joined.size;
        ranValues.main = ran.main;
        ranValues.gpu = ran.gpu;
        ranValues.dropped = dropped;
        return ranValues;
    };

    /**
     * Writes a run's report into its slot after the run's sync point, its errors with it: once tails on joined threads
     * reading reports have copied them, and observer systems there reading them have finished.
     */
    const writeReport = (slot: Slot, values: RunValues, report: RunReport): Promise<void> | null => {
        if (disposed) return null;
        const tails = state.tails.length === 0 ? null : settleKeys(state, reportIds, noIds);
        const posts = state.observer.posts.length === 0 ? null : settleObserverKeys(state, reportIds, noIds);
        if (tails === null && posts === null) return reports.finish(slot, values, report, state.tails.length !== 0, defer);
        return Promise.all([tails, posts]).then(() => disposed ? undefined : reports.finish(slot, values, report, state.tails.length !== 0, defer) ?? undefined);
    };

    /** Puts failures into the next run's or tick's report: those found once a report's errors were written. */
    const defer = (failures: readonly Failure[]): void => {
        (observerFailures ??= []).push(...failures);
    };

    /**
     * Runs a registered system or composite, ending in a sync point, and resolves to its number. With `pass`, its
     * report is written once its tails are done, then observer systems run, their failures added to it; without, its
     * report is left in `performed` and its tails in `tailing`. One async step for all, so a run awaits nothing more.
     * `registered` is its schedule as it was registered, which it runs if a system it holds was removed since,
     * skipping that system.
     */
    const perform = async (definition: Definition, value: unknown, pass: boolean, registered: Schedule | undefined): Promise<number> => {
        // Resources added between runs move the resource entity, whose structs a tail may still read.
        if (ensured.version !== programVersion() && (state.channels.length > 0 || state.observer.posts.length > 0)) await drainTails();
        ensureProgramResources(state, ensured);
        if (startWatches(state)) await reloadStamped();
        if (workersChanged()) await followWorkers();
        if (deviceChanged()) await followDevice();
        const schedule = registrar.registered(definition) ?? registered;
        if (schedule === undefined) throw new Error(`System "${definition.name}" didn't register.`);
        // An input that moved to a joined thread runs only there: that thread went since, its claims with it.
        if (isHeld(value) && (definition.kind === "composite" || registrar.runnerOf(definition).remote?.channel !== value.channel)) {
            throw new Error(`System "${definition.name}": the run's input moved to a joined thread that's gone.`);
        }
        const run = ++runs;
        const started = performance.now();
        // A run of observer systems alone has an empty sync point.
        const empty = schedule.tiers.length === 0 && skipsSync();
        // Its report's entity, spawned or reused by commands its own sync point applies, or for an empty one, applied
        // alone, which leaves other commands for the next.
        let slot: Slot | Promise<Slot> = empty ? reports.beginAlone(run) : reports.begin(run);
        if (slot instanceof Promise) slot = await slot;
        let report: RunReport;
        let tails: Promise<TailOutcome> | null = null;
        try {
            if (empty) {
                startRan(state.ran);
                report = cleanReport;
            }
            else report = await execute(context, schedule, value, definition);
        }
        finally {
            tails = context.tails;
            context.tails = null;
            if (deviceChanged()) await followDevice();
        }
        const values = valuesOf(run, started, report.dropped);
        if (!pass) {
            tailing = tails;
            performed = report;
            performedSlot = slot;
            performedValues = values;
            return run;
        }
        // A run is a transaction: it ends once its tails have.
        if (tails !== null) report = withTails(report, await tails);
        report = withFailures(report, takeFailures());
        const writing = writeReport(slot, values, report);
        if (writing !== null) await writing;
        const passed = passObserver(schedule.observer, loop.observer(), joinedRunOf(value));
        const failures = passed instanceof Promise ? await passed : passed;
        if (failures !== null) defer(failures);
        return run;
    };

    /**
     * Failures for the next run's or tick's report: of registering observer systems `add` was given, and those joined
     * threads report between runs.
     */
    let observerFailures: Failure[] | null = null;
    const takeFailures = (): Failure[] | null => {
        const failures = observerFailures;
        observerFailures = null;
        return failures;
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
    state.observer.again = () => void enqueue(async () => {
        if (disposed) return;
        const posting = postObserver(state, [], [], 0, context.workers?.pool ?? null);
        if (posting !== null) await posting;
    });

    /**
     * Registers an observer system `add` was given: at once when it can register again as it was
     * (`Registrar.reregister`), otherwise before the next run, unless it was removed meanwhile; its failure is in the
     * next pass's report.
     */
    const registerObserver = (system: Leaf): void => {
        if (registrar.registered(system) !== undefined || registrar.reregister(system)) return;
        void enqueue(async () => {
            if (disposed || registrar.registered(system) !== undefined || !loop.observer().includes(system)) return;
            try {
                await complete(registrar.register(system));
            }
            catch (error) {
                (observerFailures ??= []).push(failureOf("system", system, error));
            }
        });
    };

    /** Whether observer systems read reports, so a tick waits for its tails before running them. */
    const observerReadReport = new WeakMap<readonly Leaf[], boolean>();
    const readsReportOf = (leaves: readonly Leaf[]): boolean => {
        let reads = observerReadReport.get(leaves);
        if (reads === undefined) observerReadReport.set(leaves, reads = readReports(leaves));
        return reads;
    };

    /** A tick's tails, which `perform` leaves for its report. */
    let tailing: Promise<TailOutcome> | null = null;

    /** Writes a resource only the world writes, stamped with a tick of its own so systems see it. */
    const writeOwn = (key: Key, value: unknown): void => {
        const cell = findResource(state, key);
        if (cell === undefined) return;
        writeCell(cell.storage, cell.row, value);
        stampChanged(cell.storage, cell.row, ++state.tick);
    };

    /**
     * One tick: the clock, the added systems as one composite, then the tick's report, then observer systems with the
     * tick's values, their failures in the next run's report. While its tails or an earlier tick's run, observer systems
     * run at once, their failures in the tick's report written once those tails are done, unless one reads reports, when
     * the tick waits for those tails first.
     */
    const tick = (_: Composite, clockValue: Clock): Promise<void> => enqueue(async () => {
        // What's added as the tick starts: systems removed since the loop asked for it aren't in it.
        const composite = loop.current();
        if (disposed || composite === null) return;
        let report: RunReport;
        let run: number;
        let slot: Slot;
        let values: RunValues;
        const begun = runs;
        try {
            if (registrar.registered(composite) === undefined) {
                ensureResources(state, loopResources);
                await complete(registrar.register(composite));
            }
            const schedule = registrar.registered(composite);
            if (pending.length > 0 && readsReport(composite)) {
                await Promise.all(pending.map(each => each.tails));
                const flushing = flushReports();
                if (flushing !== null) await flushing;
            }
            if (state.tails.length !== 0) {
                const waiting = settleKeys(state, [], [clockId]);
                if (waiting !== null) await waiting;
            }
            if (state.observer.posts.length !== 0) {
                const waiting = settleObserverKeys(state, [], [clockId]);
                if (waiting !== null) await waiting;
            }
            writeOwn(clock, clockValue);
            run = await perform(composite, undefined, false, schedule);
            report = performed;
            performed = cleanReport;
            slot = performedSlot ?? reports.lastSlot();
            values = performedValues ?? valuesOf(run, performance.now(), 0);
            performedSlot = performedValues = null;
        }
        catch (error) {
            // A tick that failed before its run took a number takes one now, its report spawned between runs.
            if (runs === begun) {
                run = ++runs;
                slot = await reports.beginAlone(run);
            }
            else {
                run = runs;
                slot = reports.lastSlot();
            }
            startRan(state.ran);
            values = valuesOf(run, performance.now(), 0);
            report = { failures: [failureOf("system", composite, error)], skipped: none, dropped: 0, warnings: none };
        }
        report = withFailures(report, takeFailures());
        const tails = tailing;
        tailing = null;
        const observer = loop.observer();
        if (tails !== null || pending.length > 0) {
            if (observer.length === 0 || !readsReportOf(observer)) {
                // Observer systems get the tick's values now; its report is written once its tails, and every earlier
                // tick's, have run.
                const passed = passObserver(noLeaves, observer);
                const entry: PendingReport = { slot, values: { ...values }, report: withFailures(report, passed instanceof Promise ? await passed : passed), tails, done: tails === null };
                pending.push(entry);
                if (tails !== null) void tails.then(outcome => {
                    entry.report = withTails(entry.report, outcome);
                    entry.done = true;
                    void enqueue(async () => flushReports());
                });
                const flushing = flushReports();
                if (flushing !== null) await flushing;
                return;
            }
            await Promise.all(pending.map(each => each.tails));
            const flushing = flushReports();
            if (flushing !== null) await flushing;
            if (tails !== null) report = withTails(report, await tails);
        }
        if (disposed) return;
        const writing = writeReport(slot, values, report);
        if (writing !== null) await writing;
        const passed = passObserver(noLeaves, observer);
        const failures = passed instanceof Promise ? await passed : passed;
        if (failures !== null) defer(failures);
    });

    /** Ticks whose reports wait for their tails, in order. */
    type PendingReport = { readonly slot: Slot; readonly values: RunValues; report: RunReport; readonly tails: Promise<TailOutcome> | null; done: boolean };
    const pending: PendingReport[] = [];
    /**
     * Writes the reports of ticks whose tails, and every earlier tick's, have run: at once, unless one waits for
     * observer systems in progress on joined threads, when the rest follow it.
     */
    const flushReports = (): Promise<void> | null => {
        while (pending.length > 0 && pending[0].done) {
            const entry = pending.shift();
            if (entry === undefined || disposed) continue;
            const writing = writeReport(entry.slot, entry.values, entry.report);
            if (writing !== null) return writing.then(() => flushReports() ?? undefined);
        }
        return null;
    };
    const clockId = idOf(state, clock);
    /** Whether a tick's systems read reports, so a tick waits for the last one's tails first. */
    const readersOfReport = new WeakMap<Composite, boolean>();
    const readsReport = (composite: Composite): boolean => {
        let reads = readersOfReport.get(composite);
        if (reads === undefined) readersOfReport.set(composite, reads = registrar.registered(composite)?.tiers.some(readReports) ?? false);
        return reads;
    };

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
    const runWith = (system: { readonly name: string }, value: unknown): Promise<number> => {
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
        return enqueue(registering === null ? () => perform(ran, value, true, schedule) : async () => {
            await complete(registering);
            return perform(ran, value, true, schedule);
        });
    };

    const sharing = createSharing({
        state,
        run: runWith,
        defer: (failure: Failure) => { (observerFailures ??= []).push(failure); },
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
        run: (system, ...args) => {
            const [value]: readonly unknown[] = args;
            return runWith(system, value);
        },
        share: port => {
            checkLive();
            if (!state.memory.shared) throw new Error("Without cross-origin isolation memory can't be shared, so no thread can join.");
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
                arena: state.memory.held(),
                joined: state.channels.map(channel => channel.placed()),
                gpu: state.gpu?.records() ?? 0,
                workers: workers.map(result => ({ kernels: result.kernels ?? -1 })),
            };
        }),
    };
    return world;
};

/**
 * Creates a world, with resources starting at these values in place of their defaults. With `gpuDevice`, render
 * systems and `kernel: "gpu"` kernels run on that device.
 */
export const create: Create = resources => createWorld(resources);

/** Joins a world another thread shared, through the other end of its port, as `joinWorld` does. */
export const join: Join = (port, options) => joinWorld(port, options);
