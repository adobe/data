/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import { ResourceComponents } from "../../store/resource-components.js";
import { Store } from "../../store/index.js";
import { Database } from "../database.js";
import type { ToTransactionFunctions, TransactionDeclarations } from "../../store/transaction-functions.js";
import type { ToActionFunctions, ActionDeclarations } from "../../store/action-functions.js";
import { StringKeyof } from "../../../types/types.js";
import { isPromise } from "../../../internal/promise/is-promise.js";
import { isAsyncGenerator } from "../../../internal/async-generator/is-async-generator.js";
import { Components } from "../../store/components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { Service } from "../../../service/service.js";
import { createReconcilingDatabase } from "../reconciling/create-reconciling-database.js";
import { TransactionEnvelope } from "../reconciling/reconciling-database.js";
import { ComponentSchemas } from "../../component-schemas.js";
import { ResourceSchemas } from "../../resource-schemas.js";
import { FromSchemas } from "../../../schema/from-schemas.js";
import { calculateSystemOrder } from "../calculate-system-order.js";

export function createDatabase(): Database<{}, {}, {}, {}, never>
export function createDatabase<
    P extends Database.Plugin<{}, {}, {}, {}, never, {}>
>(plugin: P): Database<
    FromSchemas<P extends Database.Plugin<infer CS, any, any, any, any, any> ? CS : never>,
    FromSchemas<P extends Database.Plugin<any, infer RS, any, any, any, any> ? RS : never>,
    P extends Database.Plugin<any, any, infer A, any, any, any> ? A : never,
    ToTransactionFunctions<P extends Database.Plugin<any, any, any, infer TD, any, any> ? TD : never>,
    P extends Database.Plugin<any, any, any, any, infer S, any> ? S : never,
    ToActionFunctions<P extends Database.Plugin<any, any, any, any, any, infer AD> ? AD : never>
>
export function createDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
): Database<C, R, A, ToTransactionFunctions<TD>, never, {}>
export function createDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>,
    const AD extends ActionDeclarations<C, R, A, ToTransactionFunctions<TD>, never>
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
    actionDeclarations: AD,
): Database<C, R, A, ToTransactionFunctions<TD>, never, ToActionFunctions<AD>>
export function createDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>,
    const S extends string
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
    systemDeclarations: { readonly [K in S]: {
        readonly create: (db: Database<C, R, A, ToTransactionFunctions<TD>, S, any>) => (() => void | Promise<void>) | void;
        readonly schedule?: { readonly before?: readonly S[]; readonly after?: readonly S[]; readonly during?: readonly S[] };
    } },
): Database<C, R, A, ToTransactionFunctions<TD>, S, {}>
export function createDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>,
    const S extends string,
    const AD extends ActionDeclarations<C, R, A, ToTransactionFunctions<TD>, S>
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
    systemDeclarations: { readonly [K in S]: {
        readonly create: (db: Database<C, R, A, ToTransactionFunctions<TD>, S, ToActionFunctions<AD>>) => (() => void | Promise<void>) | void;
        readonly schedule?: { readonly before?: readonly S[]; readonly after?: readonly S[]; readonly during?: readonly S[] };
    } },
    actionDeclarations: AD,
): Database<C, R, A, ToTransactionFunctions<TD>, S, ToActionFunctions<AD>>
export function createDatabase(
    storeOrPlugin?: Store<any, any, any> | Database.Plugin<any, any, any, any, any, any>,
    transactionDeclarations?: any,
    systemDeclarationsOrActionDeclarations?: any,
    actionDeclarations?: any,
): any {
    if (!storeOrPlugin) {
        return createDatabaseFromPlugin(Database.Plugin.create({}));
    }
    // Check if it's a Plugin (has components, resources, archetypes, transactions, systems, or actions properties)
    if (typeof storeOrPlugin === 'object' && 'components' in storeOrPlugin) {
        return createDatabaseFromPlugin(storeOrPlugin as any);
    }
    // Check if systemDeclarationsOrActionDeclarations is systemDeclarations (has create property)
    if (systemDeclarationsOrActionDeclarations && typeof systemDeclarationsOrActionDeclarations === 'object' && !Array.isArray(systemDeclarationsOrActionDeclarations)) {
        const firstKey = Object.keys(systemDeclarationsOrActionDeclarations)[0];
        if (firstKey && systemDeclarationsOrActionDeclarations[firstKey]?.create) {
            // It's systemDeclarations
            return createDatabaseFromStoreTransactionsAndSystems(storeOrPlugin as any, transactionDeclarations, systemDeclarationsOrActionDeclarations, actionDeclarations);
        }
    }
    if (transactionDeclarations) {
        // Check if systemDeclarationsOrActionDeclarations is actually actionDeclarations
        if (systemDeclarationsOrActionDeclarations && !systemDeclarationsOrActionDeclarations[Object.keys(systemDeclarationsOrActionDeclarations)[0]]?.create) {
            return createDatabaseFromStoreAndTransactions(storeOrPlugin as any, transactionDeclarations, systemDeclarationsOrActionDeclarations);
        }
        return createDatabaseFromStoreAndTransactions(storeOrPlugin as any, transactionDeclarations);
    } else {
        // It's a Plugin (fallback)
        return createDatabaseFromPlugin(storeOrPlugin as any);
    }
}

function createDatabaseFromPlugin<
    CS extends ComponentSchemas,
    RS extends ResourceSchemas,
    A extends ArchetypeComponents<StringKeyof<CS>>,
    TD extends TransactionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A>,
    S extends string,
    AD extends ActionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>, S> = {}
>(plugin: Database.Plugin<CS, RS, A, TD, S, AD>): Database<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>, S, ToActionFunctions<AD>> {
    const systems = plugin.systems ?? ({} as any);
    const transactions = plugin.transactions ?? ({} as any);
    const actions = (plugin.actions ?? {}) as AD;
    const storeSchema: Store.Schema<CS, RS, A> = {
        components: plugin.components ?? ({} as CS),
        resources: plugin.resources ?? ({} as RS),
        archetypes: plugin.archetypes ?? ({} as A),
    };
    return createDatabase(Store.create(storeSchema), transactions, systems, actions as any) as any;
}

function createDatabaseFromStoreTransactionsAndSystems<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>,
    const S extends string,
    const AD extends ActionDeclarations<C, R, A, ToTransactionFunctions<TD>, S> = {}
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
    systemDeclarations: { readonly [K in S]: {
        readonly create: (db: Database<C, R, A, ToTransactionFunctions<TD>, S, ToActionFunctions<AD>>) => (() => void | Promise<void>) | void;
        readonly schedule?: { readonly before?: readonly S[]; readonly after?: readonly S[]; readonly during?: readonly S[] };
    } },
    actionDeclarations?: AD,
): Database<C, R, A, ToTransactionFunctions<TD>, S, ToActionFunctions<AD>> {
    type T = ToTransactionFunctions<TD> & Service;
    type TransactionName = Extract<keyof TD, string>;

    const reconcilingDatabase = createReconcilingDatabase(store, transactionDeclarations);

    let nextTransactionId = 1;

    const applyEnvelope = (envelope: TransactionEnvelope<TransactionName>) => reconcilingDatabase.apply(envelope);

    const createTransactionWrapper = (name: TransactionName) => (args: unknown) => {
        const transactionId = nextTransactionId;
        nextTransactionId += 1;

        let hasTransient = false;

        const applyTransient = (payload: unknown) => {
            hasTransient = true;
            const timestamp = Date.now();
            applyEnvelope({
                id: transactionId,
                name,
                args: payload,
                time: -timestamp,
            });
        };

        const applyCommit = (payload: unknown) => {
            const timestamp = Date.now();
            const result = applyEnvelope({
                id: transactionId,
                name,
                args: payload,
                time: timestamp,
            });
            hasTransient = false;
            return result;
        };

        const cancelPending = () => {
            if (!hasTransient) {
                return;
            }
            applyEnvelope({
                id: transactionId,
                name,
                args: undefined,
                time: 0,
            });
            hasTransient = false;
        };

        if (typeof args === "function") {
            const asyncArgsProvider = args as () => Promise<unknown> | AsyncGenerator<unknown>;
            const providerResult = asyncArgsProvider();

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

                            if (finalArgs !== undefined) {
                                const commitResult = applyCommit(finalArgs);
                                resolve(commitResult?.value);
                            } else {
                                cancelPending();
                                resolve(undefined);
                            }
                        } catch (error) {
                            cancelPending();
                            reject(error);
                        }
                    })();
                });
            }

            if (isPromise(providerResult)) {
                return (async () => {
                    try {
                        const resolved = await providerResult;
                        const commitResult = applyCommit(resolved);
                        return commitResult?.value;
                    } catch (error) {
                        cancelPending();
                        throw error;
                    }
                })();
            }

            const syncResult = applyCommit(providerResult);
            return syncResult?.value;
        }

        const result = applyCommit(args);
        return result?.value;
    };

    const transactions = {
        serviceName: "ecs-database-transactions-service",
    } satisfies Service as T;

    const addTransactionWrappers = (transactionDecls: Record<string, any>) => {
        for (const name of Object.keys(transactionDecls)) {
            (transactions as any)[name] = createTransactionWrapper(name as any);
        }
    };

    addTransactionWrappers(transactionDeclarations);

    // Create actions wrapper
    type AF = ToActionFunctions<AD> & Service;
    const actions = {
        serviceName: "ecs-database-actions-service",
    } satisfies Service as AF;

    const addActionWrappers = (actionDecls: Record<string, any>, db: Database<C, R, A, T, S, AF>) => {
        for (const name of Object.keys(actionDecls)) {
            const actionDecl = actionDecls[name];
            (actions as any)[name] = (args: unknown) => {
                return actionDecl(db, args);
            };
        }
    };

    // Track all system declarations mutably for extension
    const allSystemDeclarations = { ...systemDeclarations } as any;

    // Calculate system execution order
    let systemOrder = calculateSystemOrder(allSystemDeclarations);

    // Create partial database for system initialization (two-phase)
    const partialDatabase: any = {
        serviceName: "ecs-database-service",
        ...reconcilingDatabase,
        unsafeStore: store as Store<C, R, A>,
        transactions,
        actions, // Set actions before adding wrappers
        system: {
            functions: {},  // Empty initially
            order: systemOrder
        },
        extend: undefined  // Will be set later
    };

    // Initialize actions if provided
    if (actionDeclarations) {
        addActionWrappers(actionDeclarations, partialDatabase);
    }

    // Instantiate system functions with partial database
    const systemFunctions: any = {};
    for (const name in allSystemDeclarations) {
        systemFunctions[name] = allSystemDeclarations[name].create(partialDatabase);
    }
    partialDatabase.system.functions = systemFunctions;

    // Track extended plugins to avoid duplicate processing
    const extendedPlugins = new Set<Database.Plugin<any, any, any, any, any, any>>();

    const extend = <
        P extends Database.Plugin<any, any, any, any, any, any>
    >(
        plugin: P,
    ) => {
        // Early exit if plugin already extended
        if (!extendedPlugins.has(plugin)) {
            extendedPlugins.add(plugin);

            // Delegate to reconcilingDatabase which handles store/transactionalStore extension
            reconcilingDatabase.extend(plugin);

            const pluginTransactions = plugin.transactions ?? {};
            const pluginActions = plugin.actions ?? {};

            // Add transaction wrappers for the new transactions
            addTransactionWrappers(pluginTransactions);

            // Add action wrappers for the new actions
            addActionWrappers(pluginActions, partialDatabase);

            // If plugin has new systems, extend in place rather than recreating
            if (plugin.systems && Object.keys(plugin.systems).length > 0) {
                // Merge new systems into tracked declarations
                Object.assign(allSystemDeclarations, plugin.systems);

                // Recalculate system order with all systems
                systemOrder = calculateSystemOrder(allSystemDeclarations);

                // Instantiate only the new systems
                for (const name in plugin.systems) {
                    if (!systemFunctions[name]) {
                        systemFunctions[name] = plugin.systems[name].create(partialDatabase);
                    }
                }

                // Update system order in place
                partialDatabase.system.order = systemOrder;
                partialDatabase.system.functions = systemFunctions;
            }
        }


        // Always return the same database instance
        return partialDatabase as any;
    };

    partialDatabase.extend = extend;

    return partialDatabase as Database<C, R, A, T, S, AF> & { extend: typeof extend };
}

function createDatabaseFromStoreAndTransactions<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends TransactionDeclarations<C, R, A>,
    const AD extends ActionDeclarations<C, R, A, ToTransactionFunctions<TD>, never> = {}
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
    actionDeclarations?: AD,
): Database<C, R, A, ToTransactionFunctions<TD>, never, ToActionFunctions<AD>> {
    // Delegate to the systems-aware version with empty systems
    return createDatabaseFromStoreTransactionsAndSystems<C, R, A, TD, never, any>(
        store,
        transactionDeclarations,
        {} as { readonly [K in never]: {
            readonly create: (db: any) => (() => void | Promise<void>) | void;
            readonly schedule?: { readonly before?: readonly never[]; readonly after?: readonly never[]; readonly during?: readonly never[] };
        } },
        actionDeclarations as any
    ) as any;
}

