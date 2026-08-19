// © 2026 Adobe. MIT License. See /LICENSE for details.

import { ReadonlyStore, Store } from "../../store/index.js";
import { createTypedBuffer, ReadonlyTypedBuffer, structBufferType } from "../../../typed-buffer/index.js";
import { getStructLayout } from "../../../typed-buffer/structs/get-struct-layout.js";
import type { Schema } from "../../../schema/index.js";
import { Database, FromServiceFactories } from "../database.js";
import { PersistenceScope } from "../../persistence-scope.js";
import { calculateSystemOrder } from "../calculate-system-order.js";
import { createTransactionDispatcher } from "./create-transaction-dispatcher.js";
import { observeSelectEntities } from "../observe-select-entities.js";
import { observeIndexEntities } from "../observe-index-entities.js";
import { createObservedDatabase } from "../observed/create-observed-database.js";
import type { DatabaseVersioning } from "./database-versioning.js";
import { createImmediateConcurrency } from "../concurrency/immediate-concurrency.js";
import type { ConcurrencyStrategy, ConcurrencyStrategyFactory } from "../concurrency/concurrency-strategy.js";
import type { Entity } from "../../entity/entity.js";
import type { Observe } from "../../../observe/index.js";

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
    /**
     * Pluggable version policy consulted on every `db.fromData(snapshot)`. Omit
     * for the current behavior (always load, no reconciliation). See
     * {@link DatabaseVersioning}.
     */
    versioning?: DatabaseVersioning;
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
    const db = createEmptyDatabase({ concurrency: options?.concurrency, versioning: options?.versioning });
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
function createEmptyDatabase({ concurrency, versioning }: {
    concurrency: ConcurrencyStrategyFactory | undefined,
    versioning?: DatabaseVersioning,
}): any {
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

    const toData = (options?: { readonly scope?: PersistenceScope }) => {
        const scope = options?.scope;
        // Fast path: a strategy with no replay hook leaves the store untouched
        // after serialization, so a live-reference snapshot is safe.
        if (!strategy.onAfterToData) {
            return observedDatabase.toData({ copy: false, scope });
        }
        // A replay strategy mutates the live buffers in `onAfterToData`, which
        // would corrupt a live-reference snapshot. Capture a detached copy of
        // the committed (rolled-back) state before replaying.
        strategy.onBeforeToData?.();
        const data = observedDatabase.toData({ copy: true, scope });
        strategy.onAfterToData();
        return data;
    };
    // The version resource's singleton archetype in a store, or undefined when
    // the store carries no version (a pre-versioning legacy document). A
    // reconstructed store has no resource accessor, so the version is reached via
    // its raw singleton component.
    const versionSingleton = (s: Store<any, any, any>, name: string) =>
        s.queryArchetypes([name] as never[]).find((a) => a.rowCount > 0);

    // Read the numeric version off a store (absent ⇒ 0, a legacy document).
    const readVersionResource = (s: Store<any, any, any>, name: string): number => {
        const archetype = versionSingleton(s, name);
        return archetype ? Number((archetype.columns as Record<string, { get(i: number): unknown }>)[name]!.get(0)) : 0;
    };

    // Stamp a store's version resource to `value` (no-op if it carries none).
    const writeVersionResource = (s: Store<any, any, any>, name: string, value: number) => {
        const archetype = versionSingleton(s, name);
        if (!archetype) return;
        const id = (archetype.columns as Record<string, { get(i: number): number }>)["id"]!.get(0);
        s.update(id, { [name]: value } as never);
    };

    // Validate that the returned store's typed buffers are STORAGE-compatible
    // with the live database's, for every current-schema component the returned
    // store carries data for — the check that matters for the `copy:false`
    // structural adoption on commit, which binds those buffers into the live db by
    // reference. Two levels:
    //   - buffer `type` + per-element byte size must match (e.g. a number that
    //     changed U16→U32 / F64→F32, or any buffer-kind change, is rejected);
    //   - for a **value type** (a fixed-layout `struct` buffer) the full struct
    //     layout — field names, order, offsets and types — must match, so a
    //     same-size field reorder / rename / retype is caught too (the live db
    //     would otherwise mis-read the adopted binary buffer).
    // Cosmetic schema differences (default, min/max, description) are deliberately
    // NOT checked — those are a migration's own concern. An incompatible buffer is
    // a developer error in the migration → thrown (a rejected *document* is data:
    // the `null` return above).
    const assertReturnedBuffersCompatible = (committed: Store<any, any, any>) => {
        // `componentSchemas` is a plain string-keyed schema map at runtime; widen
        // off its readonly index signature to index it by dynamic name.
        const current = store.componentSchemas as Record<string, Schema>;
        const checked = new Set<string>();
        for (const archetype of committed.queryArchetypes([] as never[])) {
            if (archetype.rowCount === 0) continue;
            // Columns are typed buffers; the store is `any`-parameterized here so
            // name-index them through the readonly typed-buffer shape.
            const columns = archetype.columns as Record<string, ReadonlyTypedBuffer<unknown>>;
            for (const name of archetype.components) {
                if (name === "id" || name === "nonPersistent" || name === "nonShared" || checked.has(name)) continue;
                checked.add(name);
                if (!(name in current)) continue; // foreign component — dropped on commit, not adopted
                const returned = columns[name]!;
                const expected = createTypedBuffer(current[name]!, 1);
                if (returned.type !== expected.type || returned.typedArrayElementSizeInBytes !== expected.typedArrayElementSizeInBytes) {
                    throw new Error(
                        `Database version handler returned component "${name}" with an incompatible storage layout ` +
                        `(${returned.type} ${returned.typedArrayElementSizeInBytes}B vs the current ${expected.type} ${expected.typedArrayElementSizeInBytes}B). ` +
                        `A migration must convert it to the current representation.`,
                    );
                }
                // Value type: require identical struct layout, not just size. The
                // resolved layout is deterministic plain data (fields in offset
                // order), so a JSON fingerprint captures name/order/offset/type.
                if (returned.type === structBufferType) {
                    const returnedLayout = JSON.stringify(getStructLayout(returned.schema));
                    const expectedLayout = JSON.stringify(getStructLayout(expected.schema));
                    if (returnedLayout !== expectedLayout) {
                        throw new Error(
                            `Database version handler returned value-type component "${name}" with a different struct layout ` +
                            `than the current schema (field names/order/offsets/types must match for a same-size struct). ` +
                            `A migration must convert it to the current representation.`,
                        );
                    }
                }
            }
        }
    };

    const fromData = async (data: unknown, scope?: PersistenceScope): Promise<void> => {
        // Versioning applies only to whole-document (unscoped) loads. A scoped
        // load is a partial quadrant that does not carry the document's version,
        // so it bypasses the handler and loads directly (the original path), as
        // does a database with no handler configured.
        if (versioning && scope === undefined) {
            // Reconstruct the document into a bare document store (its OWN schema,
            // no dependence on the live db), read the document + current versions,
            // and hand them to the (possibly async) upgrade handler. `handle` may
            // await — e.g. `import("./upgrader")` to load migration code only when
            // a document actually needs upgrading. It returns the store to commit
            // or null to reject — a reject leaves the live db untouched.
            const documentStore = Store.create({ components: {}, resources: {}, archetypes: {} });
            documentStore.fromData(data);
            const documentVersion = readVersionResource(documentStore, versioning.resource);
            const currentVersion = readVersionResource(store, versioning.resource);
            const committed = await versioning.handle({ documentStore, documentVersion, currentVersion });
            if (committed === null) return; // reject: live database untouched
            // The live database is ALREADY initialized to the current-version
            // schema. We copy only the DATA for components it declares and adopt no
            // schema from the returned store — so conform the returned store's data
            // to the current schema first, dropping any foreign component the
            // migration left behind (`componentSchemas` keys are the components +
            // resource singletons the live db declares).
            committed.pruneToSchema(new Set(Object.keys(store.componentSchemas)));
            // The load succeeded → stamp the committed document to the current
            // version (the library owns reading it, so it owns writing it too).
            writeVersionResource(committed, versioning.resource, currentVersion);
            assertReturnedBuffersCompatible(committed);
            // Commit into the live db. copy:false hands the (now schema-conformed)
            // store's buffers over structurally — it is discarded right after — so
            // this is a cheap structural adoption of the data, not a deep copy.
            observedDatabase.fromData(committed.toData({ copy: false }));
        } else {
            observedDatabase.fromData(data, scope);
        }
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
        pruneToPluginSchema: (plugin: Database.Plugin) => {
            // The keep-set is the plugin's declared component + resource names
            // (already flattened across imports/extends at plugin creation). The
            // ECS built-ins are always kept by the store. Any in-flight transient
            // is invalidated by the structural change, so clear the strategy's
            // pending buffer, exactly as reset() does.
            const keep = new Set<string>([
                ...Object.keys(plugin.components ?? {}),
                ...Object.keys(plugin.resources ?? {}),
            ]);
            strategy.onReset();
            observedDatabase.pruneToSchema(keep);
            // Same instance, retyped to the target plugin's schema at the type
            // level (see Database.pruneToPluginSchema).
            return partialDatabase;
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

    // Reactive index handles. Each index's `observe(arg)` is built from its
    // handle's `find` + `readColumns` and fires on the same transaction-commit
    // boundary as `observe.select` (see `observeIndexEntities`). Attached at
    // the Database layer because the Store layer that creates the handles has
    // no transaction observable. `db.indexes` and `t.indexes` share the same
    // handle objects, so attaching here covers both.
    const observeIndex = observeIndexEntities(partialDatabase.observe.transactions);
    const attachIndexObservers = () => {
        // Structural view of the handle map: the Store augments each handle
        // with `find` + `readColumns` (the same internal contract the query
        // planner relies on for `find` + `routableColumns`).
        const handles = store.indexes as unknown as Record<string, {
            find(arg: unknown): readonly Entity[];
            readColumns: readonly string[];
            observe?: (arg: unknown) => Observe<readonly Entity[]>;
        }>;
        for (const name in handles) {
            const handle = handles[name];
            if (handle.observe) continue;
            handle.observe = observeIndex(handle.find, handle.readColumns);
        }
    };
    attachIndexObservers();

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
            attachIndexObservers();
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
 * Match conditions (intentionally conservative):
 *   - `options.where` is non-empty.
 *   - Every `where` key is a pure equality (`v` or `{ "==": v }`).
 *   - The `where` keys, as a set, equal some index's key columns.
 *   - When `options.order` is present, that same index must be sorted with
 *     the default comparator on exactly the requested order columns (in
 *     sequence), and every requested direction must be ascending. A
 *     descending clause, a mismatched / partial column sequence, or a custom
 *     comparator falls back to the scan. (A sorted index's `find` already
 *     returns its bucket pre-sorted, so a matched ordered query is served
 *     without a second sort.)
 *
 * The query planner accesses `store.indexes` (the user-visible handle map),
 * so test spies and any future user-installed instrumentation see the call.
 * The column / sort metadata for each index lives on the registry-internal
 * `RuntimeIndex`; `createStore` copies the routable subset onto each handle
 * as `routableColumns` / `routableOrder`, which is the structural shape the
 * planner reads below.
 *
 * After the index lookup returns candidate entities, each candidate is
 * checked for archetype membership of every `include` component so the
 * returned set respects the same archetype filter as the scan path. Index
 * order is preserved through that filter, so a matched ordered query stays
 * sorted.
 */
function trySelectViaIndex(
    store: Store<any, any, any>,
    include: readonly string[] | ReadonlySet<string>,
    options: { where?: Record<string, unknown>; order?: Record<string, boolean> } | undefined,
): readonly Entity[] | null {
    const where = options?.where;
    if (!where) return null;
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

    // Resolve the order constraint, if any. An empty order object is treated
    // as no order. Any descending (falsy) direction opts the whole query out
    // of routing — a sorted index only materializes its single ascending
    // order, so it cannot serve a descending request without re-sorting.
    let orderCols: readonly string[] | null = null;
    if (options?.order) {
        const cols = Object.keys(options.order);
        if (cols.length > 0) {
            for (const c of cols) {
                if (!options.order[c]) return null;
            }
            orderCols = cols;
        }
    }

    // Iterate the public handle map (store.indexes). Each handle carries the
    // non-public `routableColumns` / `routableOrder` fields placed by
    // `createStore`. `routableColumns: null` opts an index out of raw-where
    // auto-routing (function and slot-map keys live in a value space the
    // planner cannot infer from a where clause); `routableOrder: null` opts it
    // out of serving an `order` clause (unsorted, or custom comparator).
    //
    // For a matched index the planner passes the `{ column: value }` object as
    // the `find` argument — every index key is object-shaped, including a
    // single-column key. The call goes through `handle.find` so any
    // user-installed spy or instrumentation on the handle sees the dispatch.
    const handles = store.indexes as unknown as Readonly<Record<string, {
        readonly routableColumns: readonly string[] | null;
        readonly routableOrder: readonly string[] | null;
        find(v: unknown): readonly Entity[];
    }>>;
    let matchedHandle: typeof handles[string] | undefined;
    let matchedCols: readonly string[] | undefined;
    for (const name of Object.keys(handles)) {
        const handle = handles[name];
        const cols = handle.routableColumns;
        if (cols === null) continue;
        if (cols.length !== whereKeys.length) continue;
        if (!cols.every(c => c in values)) continue;
        // Key matches. If an order was requested, the same index must be
        // sorted on exactly those columns in the same sequence.
        if (orderCols !== null) {
            const sortCols = handle.routableOrder;
            if (sortCols === null) continue;
            if (sortCols.length !== orderCols.length) continue;
            if (!sortCols.every((c, i) => c === orderCols![i])) continue;
        }
        matchedHandle = handle;
        matchedCols = cols;
        break;
    }
    if (!matchedHandle || !matchedCols) return null;

    const candidates = matchedHandle.find(values);
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
