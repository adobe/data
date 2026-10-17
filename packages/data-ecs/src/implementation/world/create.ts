import type { Entity } from '../../types/entity/entity.js';
import type { Finalizer } from '../../types/finalizer/created.js';
import type { Rule } from '../../types/rule/created.js';
import type { Resource } from '../../types/resource/resource.js';
import { requireDefinition, type Definition } from '../../types/registry/index.js';
import type { World } from '../../types/world/world.js';
import type { Create, InitialResources } from '../../types/world/create.js';
import { gpuDevice } from '../../types/resources/gpu-device.js';
import { workers } from '../../types/resources/workers.js';
import { createGpu } from './gpu.js';
import { readCell } from './cells.js';
import { finalizeAll, type Thrown } from './finalizers.js';
import { createObservers } from './observers.js';
import type { Observe } from '../../types/observe/observe.js';
import type { Report } from '../../types/world/report.js';
import { execute, type ExecuteContext } from './execute.js';
import { sharedMemoryAvailable } from './memory.js';
import { createPool, defaultWorkerCount, type Pool } from './pool.js';
import { createPublisher } from './publish.js';
import type { EntityOptions, QueryOptions } from './reads.js';
import { createRegistrar, type Registration } from './register.js';
import { ensureResources, findResource, initialOf, setResource } from './resources.js';
import { ensureProgramResources, activate } from './activate.js';
import { kindOf } from '../../types/registry/index.js';
import { createState, startTicking, type Key } from './state.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../types/resource/value.js';

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

/** For tests and benchmarks: the chunk size kernels split at, and whether kernels may use WASM and SIMD. */
export type WorldOptions = {
    readonly minimumChunk?: number;
    readonly wasm?: boolean;
    readonly simd?: boolean;
};

/** Rows below which a kernel's archetype runs on the main thread rather than paying for a round trip. */
const defaultMinimumChunk = 16384;

/** Creates a world on this thread, as `World.create` does, with options for tests and benchmarks. */
export const createWorld = (resources: InitialResources = {}, options: WorldOptions = {}): World => {
    const shared = sharedMemoryAvailable();
    const initial = new Map<Key, unknown>();
    for (const key of Reflect.ownKeys(resources)) {
        if (kindOf(key) !== "resource") throw new Error(`"${String(key)}" isn't a registered resource.`);
        initial.set(key, Reflect.get(resources, key));
    }
    const device = resources[gpuDevice] ?? null;
    const state = createState(shared, options.wasm ?? true, options.simd ?? true, device !== null, initial);
    if (device !== null) state.gpu = createGpu(device);
    const registrar = createRegistrar(state);
    const enqueue = createQueue();
    const workerCount = shared ? resources[workers] ?? defaultWorkerCount(shared) : 0;
    state.workers = workerCount;
    /** Workers start with the first kernel, so worlds without kernels never spawn any. */
    let pool: Pool | null = null;
    const context: { -readonly [K in keyof ExecuteContext]: ExecuteContext[K] } = {
        state, runnerOf: registrar.runnerOf, kernelIndexOf: registrar.kernelIndexOf, workers: null, publish: () => {},
    };
    let disposed = false;
    const ensured = { version: -1 };

    const startPool = (): Pool => {
        const started = createPool(workerCount, state.memory);
        pool = started;
        context.workers = { pool: started, minimumChunk: options.minimumChunk ?? defaultMinimumChunk, next: 0 };
        context.publish = createPublisher(state, started);
        return started;
    };

    /** Gives workers every kernel whose main-thread load is newer than theirs, including ones a failed registration reloaded. */
    const loadOnWorkers = async (): Promise<void> => {
        const behind = registrar.kernels().filter(runner => runner.kernel?.staleOnWorkers() === true);
        if (workerCount === 0 || behind.length === 0) return;
        const workers = pool ?? startPool();
        context.publish();
        const setups = behind.flatMap(runner => runner.setup(registrar.kernelIndexOf(runner)) ?? []);
        const results = await Promise.all(Array.from({ length: workers.size }, (_, worker) => workers.request(worker, { kind: "kernels", kernels: setups })));
        const failed = results.find(result => result.error !== undefined);
        if (failed?.error !== undefined) throw failed.error;
        for (const runner of behind) runner.kernel?.loadedOnWorkers();
    };

    /** Adds resources, then loads kernels on the main thread and in every worker. Undoes the registration if loading fails. */
    const complete = async (registration: Registration): Promise<void> => {
        const { resources, ticked, kernels } = registration;
        try {
            ensureResources(state, resources);
            // Kept after a rollback: ticks nothing reads cost only memory.
            startTicking(state, ticked);
            // Workers see the new tick arrays before the next run's tasks.
            context.publish();
            await Promise.all(kernels.map(runner => runner.load()));
            await loadOnWorkers();
        }
        catch (error) {
            registration.rollback();
            observers.reassert();
            throw error;
        }
    };

    /** Once entity observers start kernels' stamps for more components: kernels that dropped them load again. */
    const reloadObserved = async (): Promise<void> => {
        // Workers see the new tick arrays before the next run's tasks.
        context.publish();
        await Promise.all(registrar.kernels().filter(runner => runner.kernel?.stale() === true).map(runner => runner.load()));
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
        const device = readDevice();
        const current = state.gpu;
        if (current !== null) {
            // A lost device's copies are gone, so its readback keeps the CPU's.
            await current.readback();
            current.destroy();
        }
        state.gpu = device === null ? null : createGpu(device);
        state.touched = device === null ? null : new Set();
        await Promise.all(registrar.placeGpuKernels().map(runner => runner.load()));
        await loadOnWorkers();
    };

    const observers = createObservers(state, readResource, enqueue);
    const world: World = {
        run: (system, ...args) => {
            const [value]: readonly unknown[] = args;
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
            return enqueue(async () => {
                if (registration !== null) await complete(registration);
                ensureProgramResources(state, ensured);
                if (observers.start()) await reloadObserved();
                if (deviceChanged()) await followDevice();
                const schedule = registrar.registered(definition);
                if (schedule === undefined) throw new Error(`System "${system.name}" didn't register.`);
                let report: Report;
                try {
                    report = await execute(context, schedule, value, system.name);
                }
                finally {
                    if (deviceChanged()) await followDevice();
                }
                // Observers get values a GPU kernel wrote, read back for them.
                const reading = observers.readback();
                if (reading !== null) await reading;
                const failed = observers.deliver();
                return failed === null ? report : { ...report, failures: [...report.failures, ...failed] };
            });
        },
        dispose: () => {
            disposed = true;
            return enqueue(async () => {
                // Per-query finalizers release what every live entity they match holds, reading the GPU's writes first.
                let errors: Thrown[] = [];
                try {
                    // A finalizer added since the last run still releases what the world's entities hold.
                    ensureProgramResources(state, ensured);
                    activate(state);
                    if (state.finalizers.length > 0) {
                        if (state.gpu?.anyAhead() === true) await state.gpu.readback();
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
        add: () => { throw new Error("World.add isn't implemented yet."); },
        share: () => { throw new Error("Sharing a world with another thread is not yet supported."); },
        [Symbol.asyncDispose]: () => world.dispose(),
        observe: {
            // Stored values match each resource's registered schema, so they have its type.
            resource: <R extends Resource.Name>(key: R) => observers.resource(key) as Observe<ReadonlyResourceValue<R>>,
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
