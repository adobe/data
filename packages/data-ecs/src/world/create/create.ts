import type { Component } from '../../component/component.js';
import type { Entity } from '../../entity/entity.js';
import type { Finalizer } from '../../finalizer/created.js';
import type { Rule } from '../../rule/created.js';
import type { Resource } from '../../resource/resource.js';
import { requireDefinition, type Definition } from '../../system/definition.js';
import type { World } from '../world.js';
import { gpu as gpuDevice } from '../../resources/gpu.js';
import { createGpu } from './gpu.js';
import { readCell } from './cells.js';
import { finalizeAll } from './finalizers.js';
import { execute, type ExecuteContext } from './execute.js';
import { sharedMemoryAvailable } from './memory.js';
import { createPool, defaultWorkerCount, type Pool } from './pool.js';
import { createPublisher } from './publish.js';
import { count, readComponent, readEntity, select } from './reads.js';
import { createRegistrar, type Registration } from './register.js';
import { ensureResources, findResource, initialOf } from './resources.js';
import { ensureProgramResources, activate } from './activate.js';
import { kindOf } from '../../registry/declare-name.js';
import { createState, startTicking, type Key } from './state.js';
import type { ReadonlyValue } from '../../component/value.js';
import type { ValuesOf } from '../../component/values-of.js';
import type { ReadonlyValue as ReadonlyResourceValue } from '../../resource/value.js';

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

/** Internal: tests choose the worker count and chunk size; apps get the platform default. */
export type WorldOptions = { readonly workers?: number; readonly minimumChunk?: number; readonly wasm?: boolean; readonly simd?: boolean } & Options;

/** Resource values a world starts with, in place of their defaults. */
export type InitialResources = { readonly [K in Resource.Name]?: Resource.Value<K> };

export type Options = { readonly resources?: InitialResources };

/** Rows below which a kernel's archetype runs on the main thread rather than paying for a round trip. */
const defaultMinimumChunk = 16384;

export const createWorld = (options: WorldOptions = {}): World => {
    const shared = sharedMemoryAvailable();
    const initial = new Map<Key, unknown>();
    const resources = options.resources ?? {};
    for (const key of Reflect.ownKeys(resources)) {
        if (kindOf(key) !== "resource") throw new Error(`"${String(key)}" isn't a registered resource.`);
        initial.set(key, Reflect.get(resources, key));
    }
    const device = resources[gpuDevice] ?? null;
    const state = createState(shared, options.wasm ?? true, options.simd ?? true, device !== null, initial);
    if (device !== null) state.gpu = createGpu(device);
    const registrar = createRegistrar(state);
    const enqueue = createQueue();
    const workerCount = shared ? options.workers ?? defaultWorkerCount(shared) : 0;
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
            // Workers get every kernel whose main-thread load is newer than theirs, including ones a failed registration reloaded.
            const behind = registrar.kernels().filter(runner => runner.kernel?.staleOnWorkers() === true);
            if (workerCount === 0 || behind.length === 0) return;
            const workers = pool ?? startPool();
            context.publish();
            const setups = behind.flatMap(runner => runner.setup(registrar.kernelIndexOf(runner)) ?? []);
            const results = await Promise.all(Array.from({ length: workers.size }, (_, worker) => workers.request(worker, { kind: "kernels", kernels: setups })));
            const failed = results.find(result => result.error !== undefined);
            if (failed?.error !== undefined) throw failed.error;
            for (const runner of behind) runner.kernel?.loadedOnWorkers();
        }
        catch (error) {
            registration.rollback();
            throw error;
        }
    };

    const checkLive = (): void => {
        if (disposed) throw new Error("The world is disposed.");
    };

    /** Pure: a resource no registered system uses still reads as its default. */
    const readResource = (key: Key): unknown => {
        const cell = findResource(state, key);
        return cell === undefined ? initialOf(state, key) : readCell(cell.storage, cell.row);
    };

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
                const schedule = registrar.registered(definition);
                if (schedule === undefined) throw new Error(`System "${system.name}" didn't register.`);
                return execute(context, schedule, value);
            });
        },
        dispose: () => {
            disposed = true;
            return enqueue(async () => {
                // Per-query finalizers release what every live entity they match holds, reading the GPU's writes first.
                let errors: unknown[] = [];
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
                if (errors.length > 0) throw errors[0];
            });
        },
        synchronize: components => {
            checkLive();
            const { gpu } = state;
            if (gpu === null) return Promise.resolve();
            const ids = new Set(components.map(key => state.ids.get(key)));
            return enqueue(() => gpu.readback(state.archetypes.flatMap(archetype => archetype.storages.filter(storage => ids.has(storage.component)))));
        },
        [Symbol.asyncDispose]: () => world.dispose(),
        query: {
            select: (has, options) => select(state, has, options),
            count: (has, options) => count(state, has, options),
        },
        read: {
            // Stored values match each component's registered schema, so they have its type.
            entity: <const C extends readonly Component.Name[]>(entity: Entity, components: C) => readEntity(state, entity, components) as ValuesOf<C> | null,
            component: <C extends Component.Name>(entity: Entity, component: C) => {
                const value = readComponent(state, entity, component);
                // Stored values match each component's registered schema, so they have its type.
                return value === undefined ? null : value as ReadonlyValue<C>;
            },
            resource: <R extends Resource.Name>(key: R) => readResource(key) as ReadonlyResourceValue<R>,
        },
    };
    return world;
};

/**
 * Creates a world. `resources` sets values resources start with in place of their defaults. With `[gpu]: device`,
 * render systems and `kernel: "gpu"` kernels run on that device.
 */
export const create = (options?: Options): World => createWorld(options);
