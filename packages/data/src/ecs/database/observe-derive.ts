// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Observe } from "../../observe/index.js";
import { equals } from "../../equals.js";
import { StringKeyof } from "../../types/types.js";
import { Entity } from "../entity/entity.js";
import { ReadonlyStore } from "../store/index.js";
import { TransactionResult } from "./transactional-store/transactional-store.js";

/**
 * A set-valued read (an index `find` / `findRange` / `get`, or a presence
 * `select`) whose dependency is the *result sequence itself*, not the columns
 * behind it. Rather than re-run the whole (potentially expensive) compute body
 * whenever a backing column changes anywhere, we cheaply gate, then recompute
 * *just this read* and compare its result to what it returned last time — the
 * same bucket-precision technique {@link observeIndexEntities} uses. Only a
 * genuinely different sequence marks the derive affected, so a change to an
 * unrelated bucket (or an unrelated archetype's membership) costs one cheap
 * recompute, never a full body re-run.
 */
type SetRead =
    // Index lookup: gate on `changedComponents ∩ readColumns` — the bucket
    // contents/order cannot move unless a key or sort column changed.
    | { readonly kind: "index"; readonly readColumns: ReadonlySet<string>; recompute(): unknown; last: unknown }
    // Presence `select(include, { exclude })`: membership is archetype-shaped, so
    // it can only change when *some* archetype's membership changed this commit
    // (`changedArchetypes`). A pure value write never moves it.
    | { readonly kind: "select"; recompute(): readonly Entity[]; last: readonly Entity[] };

/**
 * The dependency set a single `compute` run touched. Three kinds:
 *   - entity deps — a specific entity, either whole (`read(entity)`) or scoped
 *     to a set of components (`get` / `read(entity, archetype | components[])`).
 *     Re-run when that entity changed (and, when scoped, when one of the watched
 *     components changed on it, or it was deleted).
 *   - `columns` — component names a *resource* read depends on. A resource is a
 *     singleton entity carrying its own dedicated component, so `changedComponents`
 *     intersecting these is precise-in-effect. (This is the only remaining use of
 *     the coarse column gate — index and `select` reads are handled precisely
 *     below.)
 *   - `setReads` — index lookups and presence `select`s, tracked precisely by
 *     recompute-and-compare (see {@link SetRead}).
 *
 * `select`'s value-dependent `where` / `order` options are intentionally NOT
 * part of the derive read surface ({@link Database.Read}): they can only be
 * tracked coarsely (any value write to a filtered/sorted column), so a
 * value-keyed or ordered reactive read must go through a declared index, which
 * is precise and O(bucket).
 */
interface DepSet {
    readonly entityWhole: Set<Entity>;
    readonly entityComponents: Map<Entity, Set<string>>;
    readonly columns: Set<string>;
    readonly setReads: SetRead[];
}

const emptyDeps = (): DepSet => ({
    entityWhole: new Set(),
    entityComponents: new Map(),
    columns: new Set(),
    setReads: [],
});

const watchComponent = (deps: DepSet, entity: Entity, component: string) => {
    let set = deps.entityComponents.get(entity);
    if (set === undefined) {
        deps.entityComponents.set(entity, (set = new Set()));
    }
    set.add(component);
};

const affected = <C>(deps: DepSet, result: TransactionResult<C>): boolean => {
    const { changedEntities, changedComponents, changedArchetypes } = result;
    const { entityWhole, entityComponents, columns, setReads } = deps;

    // Entity deps: iterate the (usually small) *changed* set and probe the
    // watched sets — O(|changedEntities|), not O(|watched|). A commit touches a
    // handful of entities regardless of how many a derive reads.
    if (entityWhole.size > 0 || entityComponents.size > 0) {
        for (const [entity, values] of changedEntities) {
            if (entityWhole.has(entity)) {
                return true;
            }
            const watched = entityComponents.get(entity);
            if (watched === undefined) {
                continue;
            }
            if (values === null) {
                // entity deleted — any scoped read of it is now stale
                return true;
            }
            for (const component of Object.keys(values)) {
                if (watched.has(component)) {
                    return true;
                }
            }
        }
    }

    // Resource column deps.
    if (columns.size > 0 && !changedComponents.isDisjointFrom(columns)) {
        return true;
    }

    // Set-valued reads: cheap gate, then recompute-and-compare this one read.
    for (const dep of setReads) {
        if (dep.kind === "index") {
            if (changedComponents.isDisjointFrom(dep.readColumns)) {
                continue;
            }
        } else if (changedArchetypes.size === 0) {
            continue;
        }
        if (!equals(dep.last, dep.recompute())) {
            return true;
        }
    }

    return false;
};

/**
 * Builds `db.derive`. A single read-recording wrapper is constructed
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
            const readColumns: ReadonlySet<string> = new Set(handle.readColumns ?? []);
            // Record a per-bucket dependency: the exact result this lookup
            // returned, plus a thunk to recompute it. `affected` gates on the
            // read columns then recompute-compares, so an unrelated bucket's
            // change recomputes this (cheap Map-get + slice) to an identical
            // sequence and is suppressed — the derive body never re-runs.
            const recordLookup = (result: unknown, recompute: () => unknown): void => {
                if (recording) {
                    recording.setReads.push({ kind: "index", readColumns, recompute, last: result });
                }
            };
            const readHandle: Record<string, unknown> = {
                find: (arg: unknown) => {
                    const result = handle.find(arg);
                    recordLookup(result, () => handle.find(arg));
                    return result;
                },
                findRange: (arg: unknown) => {
                    const result = handle.findRange(arg);
                    recordLookup(result, () => handle.findRange(arg));
                    return result;
                },
            };
            if (typeof handle.get === "function") {
                readHandle.get = (arg: unknown) => {
                    const result = handle.get(arg);
                    recordLookup(result, () => handle.get(arg));
                    return result;
                };
            }
            out[name] = readHandle;
        }
        return out;
    };

    // The read-recording projection handed to `compute`. Delegates every read to
    // the real store and records the dependency it implies. Typed loosely here;
    // the precise `Database.Read<…>` surface is enforced at the public
    // `db.derive` boundary.
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
        // Presence select only — `include` + `exclude`, no `where` / `order`
        // (value-dependent options are omitted from the derive surface; use a
        // declared index for value-keyed or ordered reactive reads). Recorded as
        // a set-valued read gated on `changedArchetypes`: the result is
        // membership-shaped, so a pure value write can never move it, and an
        // unrelated migration recompute-compares to the same sequence.
        select: (include: readonly string[] | ReadonlySet<string>, options?: { exclude?: readonly string[] }) => {
            const exclude = options?.exclude;
            const args: [unknown, unknown] = [include, exclude === undefined ? undefined : { exclude }];
            const run = (): readonly Entity[] => (store.select as (i: unknown, o?: unknown) => readonly Entity[])(...args);
            const result = run();
            if (recording) {
                recording.setReads.push({ kind: "select", recompute: run, last: result });
            }
            return result;
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

        // `observeTransactions` fires once per committed transaction, so a
        // recompute happens at most once per commit. Emit synchronously at the
        // commit boundary — the same cadence as `observe.entity` / the raw
        // component observers a hand-written computed would use — rather than
        // deferring to a microtask, which would coalesce several commits in one
        // turn (e.g. a burst of ephemeral drag commits) into a single emission
        // and starve consumers that route per commit.
        const unobserve = observeTransactions((result) => {
            if (affected(deps, result)) {
                emit(run());
            }
        });

        return () => {
            unobserve();
        };
    };
};
