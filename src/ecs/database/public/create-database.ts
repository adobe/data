// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Store } from "../../store/index.js";
import { Database, FromServiceFactories, FromComputedFactories } from "../database.js";
import type { ToTransactionFunctions } from "../../store/transaction-functions.js";
import type { ToActionFunctions } from "../../store/action-functions.js";
import { isPromise } from "../../../internal/promise/is-promise.js";
import { isAsyncGenerator } from "../../../internal/async-generator/is-async-generator.js";
import { createReconcilingDatabase } from "../reconciling/create-reconciling-database.js";
import { TransactionEnvelope } from "../reconciling/reconciling-database.js";
import { FromSchemas } from "../../../schema/from-schemas.js";
import { calculateSystemOrder } from "../calculate-system-order.js";

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

export function createDatabase(): Database<{}, {}, {}, {}, never, {}, {}, {}>
export function createDatabase<
    P extends Database.Plugin<{}, {}, {}, {}, never, {}, any, any>
>(plugin: P): Database<
    FromSchemas<P extends Database.Plugin<infer CS, any, any, any, any, any, any, any> ? CS : never>,
    FromSchemas<P extends Database.Plugin<any, infer RS, any, any, any, any, any, any> ? RS : never>,
    P extends Database.Plugin<any, any, infer A, any, any, any, any, any> ? A : never,
    ToTransactionFunctions<P extends Database.Plugin<any, any, any, infer TD, any, any, any, any> ? TD : never>,
    P extends Database.Plugin<any, any, any, any, infer S, any, any, any> ? S : never,
    ToActionFunctions<P extends Database.Plugin<any, any, any, any, any, infer AD, any, any> ? AD : never>,
    P extends Database.Plugin<any, any, any, any, any, any, infer SVF, any> ? FromServiceFactories<SVF> : never,
    P extends Database.Plugin<any, any, any, any, any, any, any, infer CVF> ? FromComputedFactories<CVF> : never
>
export function createDatabase(
    plugin?: Database.Plugin<any, any, any, any, any, any, any, any>,
): any {
    const db = createEmptyDatabase();
    if (plugin === undefined) {
        return db;
    }
    return db.extend(plugin);
}

/**
 * Creates a database with empty store, no transactions, actions, services, computed, or systems.
 * All content is added via .extend(plugin). Single code path for extension.
 */
function createEmptyDatabase(): any {
    const store = Store.create({
        components: {},
        resources: {},
        archetypes: {},
    });
    const reconcilingDatabase = createReconcilingDatabase(store, {} as any);

    let nextTransactionId = 1;
    const applyEnvelope = (envelope: TransactionEnvelope<string>) => reconcilingDatabase.apply(envelope);

    const createTransactionWrapper = (name: string) => (args: unknown) => {
        const transactionId = nextTransactionId;
        nextTransactionId += 1;
        let hasTransient = false;
        const applyTransient = (payload: unknown) => {
            hasTransient = true;
            applyEnvelope({ id: transactionId, name, args: payload, time: -Date.now() });
        };
        const applyCommit = (payload: unknown) => {
            const result = applyEnvelope({ id: transactionId, name, args: payload, time: Date.now() });
            hasTransient = false;
            return result?.value;
        };
        const cancelPending = () => {
            if (!hasTransient) return;
            applyEnvelope({ id: transactionId, name, args: undefined, time: 0 });
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
