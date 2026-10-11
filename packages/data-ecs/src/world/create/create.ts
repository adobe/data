import type { Component } from '../../component/component.js';
import type { Entity } from '../../entity/entity.js';
import type { Resource } from '../../resource/resource.js';
import type { System } from '../../system/system.js';
import type { World } from '../world.js';
import { readCell } from './cells.js';
import { createCommands } from './commands.js';
import { count, readEntity, select } from './reads.js';
import { createRegistrar } from './register.js';
import { defaultOf, ensureResources, findResource } from './resources.js';
import { createState, type Key } from './state.js';
import { synchronize } from './synchronize.js';

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

const createWorld = (): World => {
    const state = createState();
    const commands = createCommands(state);
    const registrar = createRegistrar(state, commands);
    const enqueue = createQueue();
    let disposed = false;

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
            return enqueue(() => {
                try {
                    for (const tier of schedule.tiers) for (const leaf of tier) registrar.runnerOf(leaf).execute(value);
                }
                finally {
                    synchronize(state);
                }
            });
        },
        dispose: () => {
            disposed = true;
            return enqueue(() => {});
        },
        [Symbol.asyncDispose]: () => world.dispose(),
        systems: {
            register: (...systems: readonly System[]) => {
                try {
                    checkLive();
                    const resources = registrar.register(systems);
                    return enqueue(() => {
                        ensureResources(state, resources);
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
                const values = readEntity(state, entity, [component]);
                return values === null ? null : Reflect.get(values, component) as Readonly<Component.Types[C]>;
            },
            resource: <R extends Resource.Name>(key: R) => readResource(key) as Readonly<Resource.Types[R]>,
        },
    };
    return world;
};

/** Creates a world. With systems, it's `create().systems.register(...systems)`. */
export function create(): World;
export function create(options: { readonly systems: readonly System[] }): Promise<World>;
export function create(options?: { readonly systems: readonly System[] }): World | Promise<World> {
    const world = createWorld();
    return options === undefined ? world : world.systems.register(...options.systems);
}
