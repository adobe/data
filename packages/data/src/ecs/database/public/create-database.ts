// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ReadonlyStore, Store } from "../../store/index.js";
import { Database, FromServiceFactories } from "../database.js";
import { calculateSystemOrder } from "../calculate-system-order.js";
import { createTransactionDispatcher } from "./create-transaction-dispatcher.js";
import { observeSelectEntities } from "../observe-select-entities.js";
import { createObservedDatabase } from "../observed/create-observed-database.js";
import { createImmediateConcurrency } from "../concurrency/immediate-concurrency.js";
import type { ConcurrencyStrategy, ConcurrencyStrategyFactory } from "../concurrency/concurrency-strategy.js";
import type { Entity } from "../../entity/entity.js";

/**
 * For each system in newDeclarations that is not yet in systemFunctions: call create(db),
 * store the returned value in systemFunctions, and assign by name. Uses natural declaration order.
 * We do not execute the returned function here; that is up to the scheduler (if present).
 * System order (tiers) is only for 60fps execution.
 */
function createAndAssignSystems(
    db: any,
    systemFunctions: Record<string, unknown>,
    newDeclarations: Record<string, { create: (db: any) => unknown }>
): void {
    for (const name in newDeclarations) {
        if (name in systemFunctions) continue;
        systemFunctions[name] = newDeclarations[name].create(db) ?? null;
    }
}


interface CreateDatabaseOptions<P extends Database.Plugin<any, any, any, any, any, any, any, any>> {
    /**
     * Optional services overrides to use.
     * For each service injected here, we will use it and not call the normal service factory function.
     */
    services?: { [K in keyof FromServiceFactories<P['services']>]?: FromServiceFactories<P['services']>[K] };
    /**
     * Concurrency strategy that controls how locally-initiated transactions
     * are applied and how inbound envelopes are reconciled.
     *
     * Built-in strategies:
     *   - `createImmediateConcurrency()` — commits apply immediately, no
     *     rollback queue. Default when omitted.
     *   - `createRebaseReplayConcurrency(userId)` — deferred-commit mode with
     *     full rollback-and-replay for multi-peer synchronisation.
     */
    concurrency?: ConcurrencyStrategyFactory;
}

export function createDatabase(): Database<{}, {}, {}, {}, never, {}, {}, {}>
export function createDatabase<
    P extends Database.Plugin<{}, {}, {}, {}, never, {}, any, any>
>(
    plugin: P,
    options?: CreateDatabaseOptions<P>,
): Database.FromPlugin<P>
export function createDatabase(
    plugin?: Database.Plugin<any, any, any, any, any, any, any, any>,
    options?: CreateDatabaseOptions<any>,
): any {
    const db = createEmptyDatabase(options?.concurrency);
    if (plugin === undefined) {
        return db;
    }
    if (options?.services) {
        Object.assign(db.services, options.services);
    }
    return db.extend(plugin);
}

/**
 * Creates a database with empty store, no transactions, actions, services, computed, or systems.
 * All content is added via .extend(plugin). Single code path for extension.
 */
function createEmptyDatabase(concurrency: ConcurrencyStrategyFactory | undefined): any {
    const store = Store.create({
        components: {},
        resources: {},
        archetypes: {},
    });

    const observedDatabase = createObservedDatabase(store);

    // The transaction declarations dict is shared with the strategy via the
    // getTransaction closure: extend() updates it, the strategy reads from it.
    const transactionDeclarationsRef: Record<string, ((ctx: any, args: unknown) => void | Entity) | undefined> = {};
    const getTransaction = (name: string) => transactionDeclarationsRef[name];

    const strategyFactory = concurrency ?? createImmediateConcurrency();
    const strategy: ConcurrencyStrategy = strategyFactory(observedDatabase.execute, getTransaction);

    // The dispatcher owns everything envelope-related: id allocation,
    // commit/transient/cancel intent decisions, the deferred-commit
    // behaviour implied by the strategy, and resolving plain/promise/async-
    // generator argument shapes. We just plug its outputs into the
    // database surface.
    const dispatcher = createTransactionDispatcher(strategy.apply, {
        deferredCommit: strategy.deferredCommit,
        userId: strategy.userId,
    });
    (observedDatabase.observe as any).envelopes = dispatcher.envelopes;

    const transactions: any = { serviceName: "ecs-database-transactions-service" };
    const addTransactionWrappers = (transactionDecls: Record<string, any>) => {
        for (const name of Object.keys(transactionDecls)) {
            transactions[name] = dispatcher.wrap(name);
        }
    };

    const actions: any = { serviceName: "ecs-database-actions-service" };
    const addActionWrappers = (actionDecls: Record<string, any>, db: any) => {
        for (const name of Object.keys(actionDecls)) {
            const actionDecl = actionDecls[name];
            actions[name] = (args: unknown) => actionDecl(db, args);
        }
    };

    const allSystemDeclarations: Record<string, { create: (db: any) => unknown }> = {};
    let systemOrder: string[][] = [];
    const systemFunctions: any = {};
    const services: Record<string, unknown> = {};
    const computed: Record<string, unknown> = {};
    const extendedPlugins = new Set<Database.Plugin<any, any, any, any, any, any, any, any>>();

    // The Store layer owns the IndexRegistry: it instantiates the registry,
    // maintains it eagerly on every insert/update/delete, and exposes the
    // typed handle map as `store.indexes`. The Database layer just surfaces
    // the same reference (via spread / explicit field below) so users see
    // `db.indexes.<name>` and `t.indexes.<name>` pointing at one source of
    // truth.

    const toData = () => {
        // Fast path: a strategy with no replay hook leaves the store untouched
        // after serialization, so a live-reference snapshot is safe.
        if (!strategy.onAfterToData) {
            return observedDatabase.toData();
        }
        // A replay strategy mutates the live buffers in `onAfterToData`, which
        // would corrupt a live-reference snapshot. Capture a detached copy of
        // the committed (rolled-back) state before replaying.
        strategy.onBeforeToData?.();
        const data = observedDatabase.toData(true);
        strategy.onAfterToData();
        return data;
    };
    const fromData = (data: unknown) => {
        observedDatabase.fromData(data);
        strategy.onAfterFromData?.();
    };

    const partialDatabase: any = {
        serviceName: "ecs-database-service",
        ...observedDatabase,
        concurrency: strategy,
        apply: strategy.apply,
        cancel: strategy.cancel,
        reset: () => {
            strategy.onReset();
            observedDatabase.reset();
        },
        toData,
        fromData,
        transactions,
        actions,
        services,
        computed,
        indexes: store.indexes,
        store,
        system: { functions: systemFunctions, order: systemOrder },
        extend: undefined,
    };

    // Auto-route `db.select(include, { where })` and `db.observe.select(...)`
    // through a declared index when the where clause is exactly an equality
    // match on the index's full key tuple and there is no order clause. Other
    // shapes fall back to the archetype scan in the underlying store.
    //
    // The router dispatches through the user-visible handles in `store.indexes`
    // so any override applied to the public handle — tests, instrumentation —
    // takes effect for the routed path too.
    const baseSelect = partialDatabase.select.bind(partialDatabase);
    const indexAwareSelect = (include: any, options: any): readonly Entity[] => {
        const routed = trySelectViaIndex(store, include, options);
        if (routed !== null) return routed;
        return baseSelect(include, options);
    };
    partialDatabase.select = indexAwareSelect;

    // `observeSelectEntities` reads from its `store` parameter via only
    // `store.select` and `store.locate`. A minimal façade backed by the
    // index-aware select + the real `store.locate` satisfies that contract,
    // and replacing `observe.select` here mutates the shared `observe` object
    // (same reference as `observedDatabase.observe`) before any user code
    // can subscribe — so the default instance created inside
    // `createObservedDatabase` is cleanly dropped, with no stale closures.
    const indexAwareStoreFacade = {
        select: indexAwareSelect,
        locate: store.locate.bind(store),
    } as unknown as ReadonlyStore<any, any, any>;
    partialDatabase.observe.select = observeSelectEntities(
        indexAwareStoreFacade,
        partialDatabase.observe.transactions,
    );

    const extend = (plugin: Database.Plugin<any, any, any, any, any, any, any, any>) => {
        if (!extendedPlugins.has(plugin)) {
            extendedPlugins.add(plugin);
            observedDatabase.extend(plugin);

            // Update the shared transaction declarations ref so the strategy's
            // getTransaction closure sees the new names during replay.
            if (plugin.transactions) {
                Object.assign(transactionDeclarationsRef, plugin.transactions);
            }

            const pluginTransactions = plugin.transactions ?? {};
            const pluginActions = plugin.actions ?? {};
            const pluginServices = plugin.services ?? {};
            const pluginComputed = plugin.computed ?? {};
            addTransactionWrappers(pluginTransactions);
            addActionWrappers(pluginActions, partialDatabase);
            for (const name in pluginServices) {
                if (!(name in services)) services[name] = (pluginServices[name] as (db: any) => unknown)(partialDatabase);
            }
            for (const name in pluginComputed) {
                if (!(name in computed)) computed[name] = (pluginComputed[name] as (db: any) => unknown)(partialDatabase);
            }
            // `observedDatabase.extend(plugin)` above propagates down to
            // `store.extend({ components, resources, archetypes, indexes })`,
            // so the Store has already absorbed `plugin.indexes`. We refresh
            // our local indexes reference in case the underlying map got a
            // new identity (it doesn't today, but stay defensive).
            partialDatabase.indexes = store.indexes;
            if (plugin.systems && Object.keys(plugin.systems).length > 0) {
                Object.assign(allSystemDeclarations, plugin.systems);
                systemOrder = calculateSystemOrder(allSystemDeclarations);
                createAndAssignSystems(partialDatabase, systemFunctions, plugin.systems);
                partialDatabase.system.order = systemOrder;
                partialDatabase.system.functions = systemFunctions;
            }
        }
        return partialDatabase;
    };

    partialDatabase.extend = extend;
    return partialDatabase;
}

/**
 * Returns the equality value implied by `where[key]` if and only if the
 * condition is a pure equality — either a direct primitive value or a
 * comparison object with exactly `{ "==": v }`. Returns the sentinel
 * `NOT_EQUALITY` when the condition uses any other operator.
 */
const NOT_EQUALITY = Symbol("not-equality");
const equalityValue = (cond: unknown): unknown | typeof NOT_EQUALITY => {
    if (cond === null || typeof cond !== "object") return cond;
    const keys = Object.keys(cond as object);
    if (keys.length === 1 && keys[0] === "==") return (cond as Record<string, unknown>)["=="];
    return NOT_EQUALITY;
};

/**
 * Attempts to serve `select(include, options)` from a declared index.
 *
 * Returns `null` when no index applies; the caller must fall back to the
 * archetype scan. Returns an `Entity[]` when an index can answer the query.
 *
 * Match conditions (intentionally conservative for V2):
 *   - `options.where` is non-empty.
 *   - `options.order` is absent (sort orders are routed in a follow-up).
 *   - Every `where` key is a pure equality (`v` or `{ "==": v }`).
 *   - The `where` keys, as a set, equal some index's `components`.
 *
 * The query planner accesses `store.indexes` (the user-visible handle map),
 * so test spies and any future user-installed instrumentation see the call.
 * Components for each index are recovered from the registry-internal handle
 * (the handle exposes `find`/`findRange`/`get`; the column set is held by
 * the underlying `RuntimeIndex`, which is the registry's source of truth).
 * For the planner we treat the handle map structurally as
 * `{ [name]: { findByValues, routableColumns } }` because Store internally
 * augments each handle with these fields — see `createStore`.
 *
 * After the index lookup returns candidate entities, each candidate is
 * checked for archetype membership of every `include` component so the
 * returned set respects the same archetype filter as the scan path.
 */
function trySelectViaIndex(
    store: Store<any, any, any>,
    include: readonly string[] | ReadonlySet<string>,
    options: { where?: Record<string, unknown>; order?: Record<string, unknown> } | undefined,
): readonly Entity[] | null {
    const where = options?.where;
    if (!where || options?.order) return null;
    const whereKeys = Object.keys(where);
    if (whereKeys.length === 0) return null;

    // Collapse where to an { component -> equality-value } record, bailing if
    // any condition is not a pure equality.
    const values: Record<string, unknown> = {};
    for (const k of whereKeys) {
        const eq = equalityValue(where[k]);
        if (eq === NOT_EQUALITY) return null;
        values[k] = eq;
    }

    // Iterate the public handle map (store.indexes). Each handle carries a
    // non-public `routableColumns` field placed by `createStore` for exactly
    // this purpose. `routableColumns: null` opts an index out of raw-where
    // auto-routing (function and slot-map keys live in a value space the
    // planner cannot infer from a where clause).
    //
    // For a matched index the planner builds the appropriate `find`
    // argument: a scalar for a single-column key, the full values object
    // for a multi-column key. The call goes through `handle.find` so any
    // user-installed spy or instrumentation on the handle sees the
    // dispatch.
    const handles = store.indexes as unknown as Readonly<Record<string, {
        readonly routableColumns: readonly string[] | null;
        find(v: unknown): readonly Entity[];
    }>>;
    let matchedHandle: typeof handles[string] | undefined;
    let matchedCols: readonly string[] | undefined;
    for (const name of Object.keys(handles)) {
        const handle = handles[name];
        const cols = handle.routableColumns;
        if (cols === null) continue;
        if (cols.length !== whereKeys.length) continue;
        if (cols.every(c => c in values)) {
            matchedHandle = handle;
            matchedCols = cols;
            break;
        }
    }
    if (!matchedHandle || !matchedCols) return null;

    const findArg = matchedCols.length === 1 ? values[matchedCols[0]] : values;
    const candidates = matchedHandle.find(findArg);
    if (candidates.length === 0) return [];

    const includeArr = Array.from(include);
    if (includeArr.length === 0) return candidates.slice();

    const result: Entity[] = [];
    for (const entity of candidates) {
        const location = store.locate(entity);
        if (!location) continue;
        const cols = (location.archetype as { columns: Record<string, unknown> }).columns;
        if (includeArr.every(c => cols[c] !== undefined)) {
            result.push(entity);
        }
    }
    return result;
}
