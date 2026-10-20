import type { Entity } from '../../interface/entity/entity.js';
import type { Finalizer } from '../../interface/finalizer/created.js';
import type { Rule } from '../../interface/rule/created.js';
import type { Resource } from '../../interface/resource/resource.js';
import { requireDefinition, type Definition } from '../../interface/registry/index.js';
import type { World } from '../../interface/world/world.js';
import type { Create, InitialResources } from '../../interface/world/create.js';
import type { Failure } from '../../interface/world/report.js';
import { joinWorld } from './join.js';
import { createSharing, type ThreadProgress } from './sharing.js';
import { markDelivered } from './move-log.js';
import { gpuDevice } from '../../interface/resources/gpu-device.js';
import { workers } from '../../interface/resources/workers.js';
import { createGpu } from './gpu.js';
import { readCell, writeCell } from './cells.js';
import { finalizeAll, refreshFinalizerIndexes, type Thrown } from './finalizers.js';
import { startWatches } from './indexes.js';
import { createObservers } from './observers.js';
import type { Observe } from '../../interface/observe/observe.js';
import type { Report } from '../../interface/world/report.js';
import { clean, execute, type ExecuteContext } from './execute.js';
import { joinedIn, runSynced } from './synced.js';
import { joinedRunOf, postSynced, settlePosts, settleSyncedKeys } from './joined-synced.js';
import type { Leaf } from '../../interface/system/leaf.js';
import { settleKeys, type TailOutcome } from './tails.js';
import { sharedMemoryAvailable } from './memory.js';
import { createPool, type Pool } from './pool.js';
import type { Runner } from './runner.js';
import { platformWorkers, type WorkerPlatform, type WorkerPort } from './worker-platform.js';
import { createPublisher } from './publish.js';
import { flushBetween } from './layout-directory.js';
import { refreshDirectories } from './directories.js';
import type { EntityOptions, QueryOptions } from './reads.js';
import { createRegistrar, type Registration } from './register.js';
import type { Schedule } from '../../interface/registry/schedule.js';
import { ensureResources, findResource, initialOf, setResource } from './resources.js';
import { ensureProgramResources, activate, finalizerCrossing, placeFinalizers } from './activate.js';
import { firstKeyOf, isSynced, isWorldWritten, kindOf, programVersion, scheduleOf, type Composite } from '../../interface/registry/index.js';
import { always } from '../../interface/resources/always.js';
import { cadence, type Cadence } from '../../interface/resources/cadence.js';
import { clock } from '../../interface/resources/clock.js';
import { report as reportResource } from '../../interface/resources/report.js';
import { wake } from '../../interface/resources/wake.js';
import { stampChanged } from './archetype.js';
import { failureOf } from './failures.js';
import { createLoop, platformFrame, platformTimer, type Clock, type LoopPlatform } from './loop.js';
import { createState, idOf, startTicking, type Key } from './state.js';
import { indexOf } from './entities.js';
import { isHeld } from './transfers.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../interface/resource/value.js';
import { labelOf, labelOfItem } from '../../interface/registry/index.js';

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
export type CreatedWorld = World & { readonly threads: Observe<readonly ThreadProgress[]>; readonly tables: () => Promise<Tables> };

/** The loop's state, added to a world when its first tick runs. */
const loopResources: readonly Key[] = [cadence, always, wake, clock, reportResource];

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
const withFailures = (report: Report, failures: readonly Failure[] | null): Report =>
    failures === null ? report : { ...report, failures: [...report.failures, ...failures] };

/** A report with its tails' failures and skipped systems. */
const withTails = (report: Report, { failures, skipped }: TailOutcome): Report => failures === null && skipped === null ? report : {
    ...report, failures: failures === null ? report.failures : [...report.failures, ...failures], skipped: skipped === null ? report.skipped : [...report.skipped, ...skipped],
};

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
    };

    /** Waits for every joined thread's task in flight, as a tail may be, before what moves rows a tail may still read. */
    const drainTails = async (): Promise<void> => {
        while (state.channels.some(channel => channel.busy())) await Promise.all(state.channels.map(channel => channel.idle()));
        // Synced systems on joined threads: those in progress finish, the rest are cancelled, owed runs posted again after.
        if (state.synced.posts.length !== 0) await settlePosts(state, true);
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
        const { resources, ticked, kernels } = registration;
        try {
            await drainTails();
            ensureResources(state, resources);
            // Kept after a rollback: ticks nothing reads cost only memory.
            startTicking(state, ticked);
            publishLayouts();
            await load(kernels);
            await loadOnWorkers();
        }
        catch (error) {
            registration.rollback();
            throw error;
        }
    };

    /** Once entity observers start kernels' stamps for more components: kernels that dropped them load again. */
    const reloadObserved = async (): Promise<void> => {
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

    // The resource's value matches its registered schema, `GPUDevice | null`.
    const readDevice = (): ReadonlyResourceValue<typeof gpuDevice> => readResource(gpuDevice) as ReadonlyResourceValue<typeof gpuDevice>;

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
    const skipsSync = (): boolean => state.gpu === null && state.channels.length === 0 && state.tails.length === 0 && state.queued.length === 0 && state.synced.count === 0;

    /**
     * Runs a registered system or composite, ending in a sync point, then, with `deliver`, runs synced systems and
     * delivers to observers. One async step for all, so a run awaits nothing more. `registered` is its schedule as it
     * was registered, which it runs if a system it holds was removed since, skipping that system.
     */
    const perform = async (definition: Definition, value: unknown, deliver: boolean, registered: Schedule | undefined): Promise<Report> => {
        // Resources added between runs move the resource entity, whose structs a tail may still read.
        if (ensured.version !== programVersion() && (state.channels.length > 0 || state.synced.posts.length > 0)) await drainTails();
        ensureProgramResources(state, ensured);
        const watching = startWatches(state);
        if (observers.start() || watching) await reloadObserved();
        if (workersChanged()) await followWorkers();
        if (deviceChanged()) await followDevice();
        const schedule = registrar.registered(definition) ?? registered;
        if (schedule === undefined) throw new Error(`System "${labelOfItem(definition)}" didn't register.`);
        // An input that moved to a joined thread runs only there: that thread went since, its claims with it.
        if (isHeld(value) && (definition.kind === "composite" || registrar.runnerOf(definition).remote?.channel !== value.channel)) {
            throw new Error(`System "${labelOfItem(definition)}": the run's input moved to a joined thread that's gone.`);
        }
        let report: Report;
        let tails: Promise<TailOutcome> | null = null;
        try {
            // A run of synced systems alone has an empty sync point.
            report = schedule.tiers.length === 0 && skipsSync() ? clean : await execute(context, schedule, value, definition);
        }
        finally {
            tails = context.tails;
            context.tails = null;
            if (deviceChanged()) await followDevice();
        }
        // A run is a transaction: it ends once its tails have; a tick's report waits for them without holding the queue.
        if (tails !== null) {
            if (deliver) report = withTails(report, await tails);
            else tailing = tails;
        }
        // Observers get values a GPU kernel wrote, read back for them.
        const reading = observers.readback();
        if (reading !== null) await reading;
        if (!deliver) return report;
        const passed = passSynced(schedule.synced, loop.synced(), joinedRunOf(value));
        return delivered(withFailures(report, passed instanceof Promise ? await passed : passed));
    };

    /** Failures registering synced systems `add` was given, for the next pass's report. */
    let syncedFailures: Failure[] | null = null;
    const noLeaves: readonly Leaf[] = [];

    /**
     * Runs synced systems, the run's and those added, after a sync point, and posts those on joined threads, the run's
     * owed to joined run `run` (0 for none); returns the failures of those that ran here.
     */
    const passSynced = (own: readonly Leaf[], added: readonly Leaf[], run = 0): Failure[] | null | Promise<Failure[] | null> => {
        const failures = syncedFailures;
        syncedFailures = null;
        if (own.length === 0 && added.length === 0) return state.synced.pending.size === 0 ? failures : postAfter(failures, own, added, run);
        const ran = runSynced(context, own, added, failures);
        if (state.synced.count === 0) return ran;
        return ran instanceof Promise ? ran.then(done => postAfter(done, own, added, run)) : postAfter(ran, own, added, run);
    };

    /** Posts synced systems on joined threads after those here ran, then gives `failures`. */
    const postAfter = (failures: Failure[] | null, own: readonly Leaf[], added: readonly Leaf[], run: number): Failure[] | null | Promise<Failure[] | null> => {
        const posting = postSynced(state, joinedIn(context, own), joinedIn(context, added), run, context.workers?.pool ?? null);
        return posting === null ? failures : posting.then(() => failures);
    };
    // A post owed to a run, cancelled outside a sync point, is posted again between runs.
    state.synced.again = () => void enqueue(async () => {
        if (disposed) return;
        const posting = postSynced(state, [], [], 0, context.workers?.pool ?? null);
        if (posting !== null) await posting;
    });

    /**
     * Registers a synced system `add` was given, before the next run, unless it was removed meanwhile; its failure is in
     * the next pass's report.
     */
    const registerSynced = (system: Leaf): void => {
        if (registrar.registered(system) !== undefined) return;
        void enqueue(async () => {
            if (disposed || registrar.registered(system) !== undefined || !loop.synced().includes(system)) return;
            try {
                await complete(registrar.register(system));
            }
            catch (error) {
                (syncedFailures ??= []).push(failureOf("system", labelOfItem(system), error));
            }
        });
    };

    /** Whether synced systems read the tick's report, so a tick waits for its tails before running them. */
    const syncedReadReport = new WeakMap<readonly Leaf[], boolean>();
    const readsReportOf = (leaves: readonly Leaf[]): boolean => {
        let reads = syncedReadReport.get(leaves);
        if (reads === undefined) {
            const key = firstKeyOf(reportResource);
            reads = leaves.some(({ declaration: { resources } }) =>
                [...resources?.read ?? [], ...resources?.changed ?? [], ...resources?.is ?? [], ...resources?.not ?? []].some(each => firstKeyOf(each) === key));
            syncedReadReport.set(leaves, reads);
        }
        return reads;
    };

    /** A tick's tails, which `perform` leaves for its report. */
    let tailing: Promise<TailOutcome> | null = null;

    /** Delivers to observers, giving `report` with their failures. */
    const delivered = (report: Report): Report => {
        const failed = deliver();
        return failed === null ? report : { ...report, failures: [...report.failures, ...failed] };
    };

    /** Writes a resource only the world writes, stamped with a tick of its own so systems and observers see it. */
    const writeOwn = (key: Key, value: unknown): void => {
        const cell = findResource(state, key);
        if (cell === undefined) return;
        writeCell(cell.storage, cell.row, value);
        stampChanged(cell.storage, cell.row, ++state.tick);
    };

    /**
     * One tick: the clock, the added systems as one composite, then the tick's report, then synced systems and observers
     * with the tick's values. The report then holds the failures of synced systems and of observers that delivery
     * notified, its own included, without notifying them again. While its tails or an earlier tick's run, synced systems
     * run at once, unless one reads the report, which waits for them so it sees the tick's.
     */
    const tick = (_: Composite, clockValue: Clock): Promise<void> => enqueue(async () => {
        // What's added as the tick starts: systems removed since the loop asked for it aren't in it.
        const composite = loop.current();
        if (disposed || composite === null) return;
        let report: Report;
        try {
            if (registrar.registered(composite) === undefined) {
                ensureResources(state, loopResources);
                await complete(registrar.register(composite));
            }
            const schedule = registrar.registered(composite);
            if (reports.length > 0 && readsReport(composite)) {
                await Promise.all(reports.map(pending => pending.tails));
                flushReports();
            }
            if (state.tails.length !== 0) {
                const waiting = settleKeys(state, [], [clockId]);
                if (waiting !== null) await waiting;
            }
            if (state.synced.posts.length !== 0) {
                const waiting = settleSyncedKeys(state, [], [clockId]);
                if (waiting !== null) await waiting;
            }
            writeOwn(clock, clockValue);
            report = await perform(composite, undefined, false, schedule);
        }
        catch (error) {
            report = { failures: [failureOf("system", labelOfItem(composite), error)], skipped: [], dropped: 0, warnings: [] };
        }
        const tails = tailing;
        tailing = null;
        const synced = loop.synced();
        if (tails !== null || reports.length > 0) {
            if (synced.length === 0 || !readsReportOf(synced)) {
                // Synced systems and observers get the tick's values now, and its report once its tails, and every
                // earlier tick's, have run.
                const passed = passSynced(noLeaves, synced);
                const syncedFailed = passed instanceof Promise ? await passed : passed;
                const pending: PendingReport = { report: withFailures(withFailures(report, syncedFailed), deliver()), tails, done: tails === null };
                reports.push(pending);
                if (tails !== null) void tails.then(outcome => {
                    pending.report = withTails(pending.report, outcome);
                    pending.done = true;
                    void enqueue(async () => flushReports());
                });
                flushReports();
                return;
            }
            await Promise.all(reports.map(pending => pending.tails));
            flushReports();
            if (tails !== null) report = withTails(report, await tails);
        }
        if (disposed) return;
        writeOwnReport(report);
        const passed = passSynced(noLeaves, synced);
        amendReport(amendReport(report, passed instanceof Promise ? await passed : passed), deliver());
    });

    /** Writes a tick's report, stamped so systems and observers see it. */
    const writeOwnReport = (report: Report): void => {
        if (readResource(reportResource) !== report) writeOwn(reportResource, report);
    };

    /** Puts failures found once a tick's report was written into it, without notifying again; returns the report it holds. */
    const amendReport = (report: Report, failures: readonly Failure[] | null): Report => {
        if (failures === null) return report;
        const amended = withFailures(report, failures);
        const cell = findResource(state, reportResource);
        if (cell !== undefined) writeCell(cell.storage, cell.row, amended);
        return amended;
    };

    /** Writes a tick's report, then delivers to observers, the report then holding their failures without notifying them again. */
    const writeReport = (report: Report): void => {
        if (disposed) return;
        writeOwnReport(report);
        amendReport(report, deliver());
    };

    /** Ticks whose reports wait for their tails, in order. */
    type PendingReport = { report: Report; readonly tails: Promise<TailOutcome> | null; done: boolean };
    const reports: PendingReport[] = [];
    /** Writes the reports of ticks whose tails, and every earlier tick's, have run. */
    const flushReports = (): void => {
        while (reports.length > 0 && reports[0].done) {
            const pending = reports.shift();
            if (pending !== undefined) writeReport(pending.report);
        }
    };
    const clockId = idOf(state, clock);
    /** Whether a tick's systems read its report, so a tick waits for the last one's tails first. */
    const readersOfReport = new WeakMap<Composite, boolean>();
    const readsReport = (composite: Composite): boolean => {
        let reads = readersOfReport.get(composite);
        if (reads === undefined) {
            const schedule = registrar.registered(composite);
            const key = firstKeyOf(reportResource);
            reads = schedule?.tiers.some(tier => tier.some(({ declaration: { resources } }) =>
                [...resources?.read ?? [], ...resources?.changed ?? [], ...resources?.is ?? [], ...resources?.not ?? []].some(each => firstKeyOf(each) === key))) ?? false;
            readersOfReport.set(composite, reads);
        }
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

    const observers = createObservers(state, readResource, enqueue);

    /** Delivers to observers; joined threads filling objects read theirs as of the sync point delivered through. */
    const deliver = (): Failure[] | null => {
        const failed = observers.deliver();
        if (state.claimed) for (const log of state.logs) markDelivered(log);
        return failed;
    };

    /** Runs a system or composite with its input, as `run` does. */
    const runWith = (system: { readonly name: string }, value: unknown): Promise<Report> => {
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
        // A run of synced systems alone doesn't wake the loop.
        if (scheduleOf(ran).tiers.length > 0) loop.arrived();
        return enqueue(registering === null ? () => perform(ran, value, true, schedule) : async () => {
            await complete(registering);
            return perform(ran, value, true, schedule);
        });
    };

    const sharing = createSharing({
        state,
        run: runWith,
        observers,
        defer: (failure: Failure) => observers.defer(failure),
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
        synced: {
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
            if (isSynced(definition)) registerSynced(definition);
        },
        remove: system => {
            const definition = requireDefinition(system);
            if (disposed) return;
            const change = loop.remove(definition);
            if (change === null) return;
            let forgotten: readonly Definition[];
            if (isSynced(definition)) {
                // A synced system added alone, which the composite ticks run doesn't hold: forgotten unless an added composite does.
                if (loop.synced().includes(definition)) return;
                forgotten = [definition];
            }
            else {
                // What's still added keeps its runners; the rest, the composite ticks ran included, is forgotten.
                const kept = new Set<Definition>(change.next === null ? [] : registrar.systemsOf(change.next));
                for (const leaf of loop.synced()) kept.add(leaf);
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
        observe: {
            // Stored values match each resource's registered schema, so they have its type.
            resource: <R extends Resource.Key>(key: R) => observers.resource(key) as Observe<ReadonlyResourceValue<R>>,
            // Stored values match each component's registered schema, so they have its type.
            entity: ((entity: Entity, options?: EntityOptions) => observers.entity(entity, options)) as World["observe"]["entity"],
            // Selections are entities of this world.
            select: query => observers.query(query, false) as Observe<readonly Entity[]>,
            count: query => observers.query(query, true) as Observe<number>,
        },
    };
    return world;
};

/**
 * Creates a world, with resources starting at these values in place of their defaults. With `gpuDevice`, render
 * systems and `kernel: "gpu"` kernels run on that device.
 */
export const create: Create = resources => createWorld(resources);

/** Joins a world another thread shared, through the other end of its port, as `joinWorld` does. */
export const join: typeof joinWorld = (port, options) => joinWorld(port, options);
