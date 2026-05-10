// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Store } from "../../store/index.js";
import { Database, FromServiceFactories } from "../database.js";
import { isPromise } from "../../../internal/promise/is-promise.js";
import { isAsyncGenerator } from "../../../internal/async-generator/is-async-generator.js";
import { createReconcilingDatabase } from "../reconciling/create-reconciling-database.js";
import { TransactionEnvelope } from "../reconciling/reconciling-database.js";
import { TransactionResult } from "../transactional-store/index.js";
import { calculateSystemOrder } from "../calculate-system-order.js";
import { Observe } from "../../../observe/index.js";

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

export interface CreateDatabaseOptions<P extends Database.Plugin<any, any, any, any, any, any, any, any>> {
    /**
     * Optional services overrides to use.
     * For each service injected here, we will use it and not call the normal service factory function.
     */
    services?: { [K in keyof FromServiceFactories<P['services']>]?: FromServiceFactories<P['services']>[K] };
    /**
     * Stable identifier for this peer/session. Stamped onto every locally-
     * generated `TransactionEnvelope` and used by the reconciler as part of
     * its compound `(userId, id)` queue key.
     *
     * In a multi-peer (sync) deployment this MUST be unique per peer so that
     * the per-DB id counter in different peers cannot collide and confuse
     * the reconciler's transient-replace semantics.
     */
    userId?: number | string;
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
    const db = createEmptyDatabase(options?.userId);
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
function createEmptyDatabase(userId?: number | string): any {
    const store = Store.create({
        components: {},
        resources: {},
        archetypes: {},
    });
    const reconcilingDatabase = createReconcilingDatabase(store, {} as any);

    // Outbound envelope event — fires once per locally-initiated envelope
    // produced by the transaction wrappers. Inbound `db.apply()` and
    // reconciler replays do NOT fire it. The `intent` records the wrapper's
    // decision so a sync service can forward each envelope as a propose,
    // transient, or cancel without re-deriving from the time sign.
    type EnvelopeEvent = {
        envelope: TransactionEnvelope;
        result: TransactionResult<unknown> | undefined;
        intent: "commit" | "transient" | "cancel";
    };
    const [envelopesObserve, notifyEnvelope] = Observe.createEvent<EnvelopeEvent>();
    (reconcilingDatabase.observe as any).envelopes = envelopesObserve;

    // Deferred-commit mode (toggled by an attached sync service). When true,
    // the wrapper applies "commit" intents as local transients and lets the
    // server's echoed `committed` envelope promote them via the reconciler's
    // rebase-replay. This is required for cross-peer entity-id determinism
    // under concurrent edits.
    let deferredCommitMode = false;
    const setDeferredCommitMode = (enabled: boolean) => {
        deferredCommitMode = enabled;
    };

    let nextTransactionId = 1;
    const apply = (envelope: TransactionEnvelope<string>): TransactionResult<unknown> | undefined => {
        return reconcilingDatabase.apply(envelope) as TransactionResult<unknown> | undefined;
    };

    const createTransactionWrapper = (name: string) => (args: unknown) => {
        const transactionId = nextTransactionId;
        nextTransactionId += 1;
        let hasTransient = false;
        const applyTransient = (payload: unknown) => {
            hasTransient = true;
            const envelope: TransactionEnvelope = { id: transactionId, userId, name, args: payload, time: -Date.now() };
            const result = apply(envelope);
            notifyEnvelope({ envelope, result, intent: "transient" });
        };
        const applyCommit = (payload: unknown) => {
            // In deferred-commit mode the commit is applied locally as a
            // transient; the server's echo will promote it. Otherwise it
            // commits immediately with positive time.
            const time = deferredCommitMode ? -Date.now() : Date.now();
            const envelope: TransactionEnvelope = { id: transactionId, userId, name, args: payload, time };
            const result = apply(envelope);
            notifyEnvelope({ envelope, result, intent: "commit" });
            hasTransient = deferredCommitMode;
            return result?.value;
        };
        const cancelPending = () => {
            if (!hasTransient) return;
            const envelope: TransactionEnvelope = { id: transactionId, userId, name, args: undefined, time: 0 };
            apply(envelope);
            notifyEnvelope({ envelope, result: undefined, intent: "cancel" });
            hasTransient = false;
        };
        if (typeof args === "function") {
            const providerResult = (args as () => Promise<unknown> | AsyncGenerator<unknown>)();
            if (isAsyncGenerator(providerResult)) {
                return new Promise((resolve, reject) => {
                    (async () => {
                        let lastArgs: unknown;
                        try {
                            let iteration = await providerResult.next();
                            while (!iteration.done) {
                                lastArgs = iteration.value;
                                applyTransient(iteration.value);
                                iteration = await providerResult.next();
                            }
                            const finalArgs = iteration.value !== undefined ? iteration.value : lastArgs;
                            if (finalArgs !== undefined) resolve(applyCommit(finalArgs));
                            else { cancelPending(); resolve(undefined); }
                        } catch (e) { cancelPending(); reject(e); }
                    })();
                });
            }
            if (isPromise(providerResult)) {
                return (async () => {
                    try {
                        return applyCommit(await providerResult);
                    } catch (e) {
                        cancelPending();
                        throw e;
                    }
                })();
            }
            return applyCommit(providerResult);
        }
        return applyCommit(args);
    };

    const transactions: any = { serviceName: "ecs-database-transactions-service" };
    const addTransactionWrappers = (transactionDecls: Record<string, any>) => {
        for (const name of Object.keys(transactionDecls)) {
            transactions[name] = createTransactionWrapper(name);
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

    const partialDatabase: any = {
        serviceName: "ecs-database-service",
        ...reconcilingDatabase,
        setDeferredCommitMode,
        transactions,
        actions,
        services,
        computed,
        store,
        system: { functions: systemFunctions, order: systemOrder },
        extend: undefined,
    };

    const extend = (plugin: Database.Plugin<any, any, any, any, any, any, any, any>) => {
        if (!extendedPlugins.has(plugin)) {
            extendedPlugins.add(plugin);
            reconcilingDatabase.extend(plugin);
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
