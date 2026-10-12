import type { Component } from '../../component/component.js';
import type { Entity } from '../../entity/entity.js';
import type { Resource } from '../../resource/resource.js';
import type { System } from '../../system/system.js';
import type { World } from '../world.js';
import type { GpuOptions } from '../gpu.js';
import { createGpu } from './gpu.js';
import { isLeaf } from './schedule.js';
import { readCell } from './cells.js';
import { execute, type ExecuteContext } from './execute.js';
import { sharedMemoryAvailable } from './memory.js';
import { createPool, defaultWorkerCount, type Pool } from './pool.js';
import { createPublisher } from './publish.js';
import { count, readComponent, readEntity, select } from './reads.js';
import { createRegistrar, type Registration } from './register.js';
import { defaultOf, ensureResources, findResource } from './resources.js';
import { createState, startTicking, type Key } from './state.js';

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
export type WorldOptions = { readonly workers?: number; readonly minimumChunk?: number; readonly wasm?: boolean; readonly simd?: boolean; readonly gpu?: GpuOptions };

/** Rows below which a kernel's archetype runs on the main thread rather than paying for a round trip. */
const defaultMinimumChunk = 16384;

export const createWorld = (options: WorldOptions = {}): World => {
    const shared = sharedMemoryAvailable();
    const state = createState(shared, options.wasm ?? true, options.simd ?? true, options.gpu !== undefined);
    if (options.gpu !== undefined) {
        state.gpu = createGpu(options.gpu.device);
        const place = (system: System): void => {
            if (isLeaf(system)) state.placed.add(system);
            else for (const member of system.declaration.systems) place(member);
        };
        for (const system of options.gpu.place ?? []) place(system);
    }
    const registrar = createRegistrar(state);
    const enqueue = createQueue();
    const workerCount = shared ? options.workers ?? defaultWorkerCount(shared) : 0;
    /** Workers start with the first kernel, so worlds without kernels never spawn any. */
    let pool: Pool | null = null;
    const context: { -readonly [K in keyof ExecuteContext]: ExecuteContext[K] } = {
        state, runnerOf: registrar.runnerOf, kernelIndexOf: registrar.kernelIndexOf, workers: null, publish: () => {},
    };
    let disposed = false;

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
        return cell === undefined ? defaultOf(key) : readCell(cell.storage, cell.row);
    };

    const world: World = {
        run: (system, ...args) => {
            checkLive();
            const schedule = registrar.scheduleOf(system);
            const [value]: readonly unknown[] = args;
            return enqueue(() => execute(context, schedule, value));
        },
        dispose: () => {
            disposed = true;
            return enqueue(async () => {
                state.gpu?.destroy();
                await pool?.terminate();
            });
        },
        synchronize: components => {
            checkLive();
            const { gpu } = state;
            if (gpu === null) return Promise.resolve();
            const ids = new Set(components.map(key => state.ids.get(key)));
            return enqueue(() => gpu.readback(state.archetypes.flatMap(archetype => archetype.storages.filter(storage => ids.has(storage.component)))));
        },
        gpu: state.gpu === null ? null : { device: state.gpu.device, layout: state.gpu.renderLayout },
        [Symbol.asyncDispose]: () => world.dispose(),
        systems: {
            register: (...systems: readonly System[]) => {
                try {
                    checkLive();
                    const registration = registrar.register(systems);
                    return enqueue(async () => {
                        await complete(registration);
                        return world;
                    });
                }
                catch (error) {
                    return Promise.reject(error);
                }
            },
            get: name => registrar.get(name),
        },
        query: {
            select: (include, options) => select(state, include, options),
            count: (include, options) => count(state, include, options),
        },
        read: {
            // Stored values match each component's registered schema, so they have its type.
            entity: <const C extends readonly Component.Name[]>(entity: Entity, components: C) => readEntity(state, entity, components) as Component.ValuesOf<C> | null,
            component: <C extends Component.Name>(entity: Entity, component: C) => {
                const value = readComponent(state, entity, component);
                // Stored values match each component's registered schema, so they have its type.
                return value === undefined ? null : value as Readonly<Component.Types[C]>;
            },
            resource: <R extends Resource.Name>(key: R) => readResource(key) as Readonly<Resource.Types[R]>,
        },
    };
    return world;
};

/**
 * Creates a world. With systems, it's `create().systems.register(...systems)`. With `gpu`, render systems and the
 * kernels in `gpu.place` run on that device.
 */
export function create(): World;
export function create(options: { readonly systems?: readonly System[]; readonly gpu?: GpuOptions }): Promise<World>;
export function create(options?: { readonly systems?: readonly System[]; readonly gpu?: GpuOptions }): World | Promise<World> {
    const world = createWorld({ gpu: options?.gpu });
    return options === undefined ? world : world.systems.register(...options.systems ?? []);
}
