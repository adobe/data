// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Store } from "../../store/index.js";
import { Database, FromServiceFactories } from "../database.js";
import { createReconcilingDatabase } from "../reconciling/create-reconciling-database.js";
import { calculateSystemOrder } from "../calculate-system-order.js";
import { createTransactionDispatcher } from "./create-transaction-dispatcher.js";

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

/**
 * Sync-related options. Presence of `sync` means "this database is going to
 * be attached to a sync service", which has two consequences:
 *
 *   1. Every locally-generated `TransactionEnvelope` is stamped with
 *      `userId`, and the reconciler keys its transient queue by the
 *      compound `(userId, id)` so two peers' independent local id counters
 *      cannot collide.
 *   2. The transaction wrapper enters deferred-commit mode: calls to
 *      `db.transactions.X(args)` apply locally as transients (negative
 *      time) and wait for the server's echoed `committed` envelope to
 *      promote them via the reconciler's rebase-replay. This is required
 *      for cross-peer entity-id determinism under concurrent edits.
 *
 * If `sync` is omitted the database operates in local-only mode: commits
 * apply immediately with positive time, no envelope stamping, no deferred
 * promotion.
 */
export interface DatabaseSyncOptions {
    /**
     * Stable peer/session identifier. Must be unique across all peers
     * sharing the same sync server.
     */
    readonly userId: number | string;
}

interface CreateDatabaseOptions<P extends Database.Plugin<any, any, any, any, any, any, any, any>> {
    /**
     * Optional services overrides to use.
     * For each service injected here, we will use it and not call the normal service factory function.
     */
    services?: { [K in keyof FromServiceFactories<P['services']>]?: FromServiceFactories<P['services']>[K] };
    /** See {@link DatabaseSyncOptions}. */
    sync?: DatabaseSyncOptions;
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
    const db = createEmptyDatabase(options?.sync);
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
function createEmptyDatabase(sync: DatabaseSyncOptions | undefined): any {
    const store = Store.create({
        components: {},
        resources: {},
        archetypes: {},
    });
    const reconcilingDatabase = createReconcilingDatabase(store, {} as any);

    // The dispatcher owns everything envelope-related: id allocation,
    // commit/transient/cancel intent decisions, the deferred-commit
    // behaviour implied by sync mode, and resolving plain/promise/async-
    // generator argument shapes. We just plug its outputs into the
    // database surface.
    const dispatcher = createTransactionDispatcher(reconcilingDatabase.apply, sync);
    (reconcilingDatabase.observe as any).envelopes = dispatcher.envelopes;

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

    const partialDatabase: any = {
        serviceName: "ecs-database-service",
        ...reconcilingDatabase,
        sync,
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
