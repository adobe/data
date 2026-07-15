// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { equals } from "../../equals.js";
import { StringKeyof } from "../../types/types.js";
import { Entity } from "../entity/entity.js";
import { ReadonlyStore } from "../store/index.js";
import { TransactionResult } from "./transactional-store/transactional-store.js";

/**
 * The dependency set a single `compute` run touched. Reads reduce to two kinds
 * of dependency:
 *   - entity deps — a specific entity, either whole (`read(entity)`) or scoped
 *     to a set of components (`get` / `read(entity, archetype | components[])`).
 *     Re-run when that entity changed (and, when scoped, when one of the watched
 *     components changed on it, or it was deleted).
 *   - column deps — component names whose *value or membership* a `select`, an
 *     index lookup, or a resource read depends on. Re-run when the transaction's
 *     `changedComponents` intersects them. (`select` include/exclude/where/order
 *     keys, an index's `readColumns`, and a resource's own component name all
 *     land here — a set of entities can only gain/lose a member, reorder, or
 *     change a read value by touching one of these columns.)
 */
interface DepSet {
    readonly entityWhole: Set<Entity>;
    readonly entityComponents: Map<Entity, Set<string>>;
    readonly columns: Set<string>;
}

const emptyDeps = (): DepSet => ({
    entityWhole: new Set(),
    entityComponents: new Map(),
    columns: new Set(),
});

const watchComponent = (deps: DepSet, entity: Entity, component: string) => {
    let set = deps.entityComponents.get(entity);
    if (set === undefined) {
        deps.entityComponents.set(entity, (set = new Set()));
    }
    set.add(component);
};

const affected = <C>(deps: DepSet, result: TransactionResult<C>): boolean => {
    const { changedEntities, changedComponents } = result;
    for (const entity of deps.entityWhole) {
        if (changedEntities.has(entity)) {
            return true;
        }
    }
    for (const [entity, components] of deps.entityComponents) {
        if (!changedEntities.has(entity)) {
            continue;
        }
        const values = changedEntities.get(entity);
        if (values === undefined) {
            // unreachable: `has(entity)` was true above — satisfies the map's
            // `V | undefined` return type.
            continue;
        }
        if (values === null) {
            // entity deleted — any scoped read of it is now stale
            return true;
        }
        for (const component of Object.keys(values)) {
            if (components.has(component)) {
                return true;
            }
        }
    }
    if (deps.columns.size > 0) {
        for (const component of changedComponents) {
            if (deps.columns.has(component)) {
                return true;
            }
        }
    }
    return false;
};

/**
 * Builds `db.observe.derive`. A single read-recording wrapper is constructed
 * once and shared across every derive on this database: because a `compute`
 * body is synchronous and performs no writes or nested derives, no two runs can
 * overlap, so the wrapper's "currently-recording" target is reset per run and
 * safely reused.
 */
export const createDerive = <C extends object>(
    store: ReadonlyStore<C, any, any, any>,
    observeTransactions: Observe<TransactionResult<C>>,
) => {
    // The active recording target, non-null only for the duration of one
    // synchronous `compute` run.
    let recording: DepSet | null = null;

    // `resources` and `indexes` are built lazily and cached: the store's
    // resource and index maps are populated during database construction, which
    // finishes AFTER this factory is created, but before any derive can run.
    let resourcesRecorder: Record<string, unknown> | null = null;
    const buildResources = () => {
        const out: Record<string, unknown> = {};
        for (const name of Object.keys(store.resources)) {
            Object.defineProperty(out, name, {
                enumerable: true,
                get() {
                    if (recording) {
                        recording.columns.add(name);
                    }
                    return (store.resources as Record<string, unknown>)[name];
                },
            });
        }
        return out;
    };

    let indexesRecorder: Record<string, unknown> | null = null;
    const buildIndexes = () => {
        const out: Record<string, unknown> = {};
        const storeIndexes = (store.indexes ?? {}) as Record<string, any>;
        for (const name of Object.keys(storeIndexes)) {
            const handle = storeIndexes[name];
            const readColumns: readonly string[] = handle.readColumns ?? [];
            const trackIndex = () => {
                if (recording) {
                    for (const column of readColumns) {
                        recording.columns.add(column);
                    }
                }
            };
            const readHandle: Record<string, unknown> = {
                find: (arg: unknown) => {
                    trackIndex();
                    return handle.find(arg);
                },
                findRange: (arg: unknown) => {
                    trackIndex();
                    return handle.findRange(arg);
                },
            };
            if (typeof handle.get === "function") {
                readHandle.get = (arg: unknown) => {
                    trackIndex();
                    return handle.get(arg);
                };
            }
            out[name] = readHandle;
        }
        return out;
    };

    // The read-recording projection handed to `compute`. Delegates every read to
    // the real store and records the dependency it implies. Typed loosely here;
    // the precise `Database.Read<…>` surface is enforced at the public
    // `db.observe.derive` boundary.
    const recorder = {
        get: (entity: Entity, component: StringKeyof<C>) => {
            if (recording) {
                watchComponent(recording, entity, component);
            }
            return store.get(entity, component);
        },
        read: (entity: Entity, archetypeOrComponents?: { readonly components: ReadonlySet<string> } | readonly string[]) => {
            if (recording) {
                if (archetypeOrComponents === undefined) {
                    recording.entityWhole.add(entity);
                } else if (Array.isArray(archetypeOrComponents)) {
                    for (const component of archetypeOrComponents as readonly string[]) {
                        watchComponent(recording, entity, component);
                    }
                } else {
                    for (const component of (archetypeOrComponents as { readonly components: ReadonlySet<string> }).components) {
                        watchComponent(recording, entity, component);
                    }
                }
            }
            return (store.read as (e: Entity, a?: unknown) => unknown)(entity, archetypeOrComponents);
        },
        select: (include: readonly string[] | ReadonlySet<string>, options?: { exclude?: readonly string[]; where?: object; order?: object }) => {
            if (recording) {
                for (const component of include) {
                    recording.columns.add(component);
                }
                if (options?.exclude) {
                    for (const component of options.exclude) {
                        recording.columns.add(component);
                    }
                }
                if (options?.where) {
                    for (const component of Object.keys(options.where)) {
                        recording.columns.add(component);
                    }
                }
                if (options?.order) {
                    for (const component of Object.keys(options.order)) {
                        recording.columns.add(component);
                    }
                }
            }
            return (store.select as (i: unknown, o?: unknown) => readonly Entity[])(include, options);
        },
        get resources() {
            return (resourcesRecorder ??= buildResources());
        },
        get indexes() {
            return (indexesRecorder ??= buildIndexes());
        },
        // Archetype identity (components / id) is static, so reading it records
        // no dependency; delegate to the real archetypes.
        archetypes: store.archetypes,
    };

    return <T>(compute: (db: any) => T): Observe<T> => (notify) => {
        let last: T;
        let hasLast = false;
        let scheduled = false;
        let deps: DepSet = emptyDeps();

        const run = (): T => {
            recording = emptyDeps();
            try {
                return compute(recorder);
            } finally {
                deps = recording;
                recording = null;
            }
        };

        const emit = (value: T) => {
            if (!hasLast || !equals(last, value)) {
                last = value;
                hasLast = true;
                notify(value);
            }
        };

        emit(run());

        const unobserve = observeTransactions((result) => {
            if (!affected(deps, result)) {
                return;
            }
            if (scheduled) {
                return;
            }
            scheduled = true;
            queueMicrotask(() => {
                scheduled = false;
                emit(run());
            });
        });

        return () => {
            unobserve();
        };
    };
};
