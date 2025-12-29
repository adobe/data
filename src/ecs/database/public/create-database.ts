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
    CS extends ComponentSchemas,
    RS extends ResourceSchemas,
    A extends ArchetypeComponents<StringKeyof<CS>>,
    TD extends ActionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A>,
    S extends string
>(plugin: Database.Plugin<CS, RS, A, TD, S>): Database<FromSchemas<CS>, FromSchemas<RS>, A, ToActionFunctions<TD>, S>
export function createDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends ActionDeclarations<C, R, A>
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
): Database<C, R, A, ToActionFunctions<TD>, never>
export function createDatabase<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends ActionDeclarations<C, R, A>,
    const S extends string
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
    systemDeclarations: { readonly [K in S]: {
        readonly create: (db: Database<C, R, A, ToActionFunctions<TD>, S>) => (() => void | Promise<void>) | void;
        readonly schedule?: { readonly before?: readonly S[]; readonly after?: readonly S[]; readonly during?: readonly S[] };
    } },
): Database<C, R, A, ToActionFunctions<TD>, S>
export function createDatabase(
    storeOrPlugin?: Store<any, any, any> | Database.Plugin<any, any, any, any, any>,
    transactionDeclarations?: any,
    systemDeclarations?: any,
): any {
    if (!storeOrPlugin) {
        return createDatabaseFromPlugin(Database.Plugin.create({}));
    }
    if (systemDeclarations) {
        return createDatabaseFromStoreTransactionsAndSystems(storeOrPlugin as any, transactionDeclarations, systemDeclarations);
    }
    if (transactionDeclarations) {
        return createDatabaseFromStoreAndTransactions(storeOrPlugin as any, transactionDeclarations);
    } else {
        // It's a Plugin
        return createDatabaseFromPlugin(storeOrPlugin as any);
    }
}

function createDatabaseFromPlugin<
    CS extends ComponentSchemas,
    RS extends ResourceSchemas,
    A extends ArchetypeComponents<StringKeyof<CS>>,
    TD extends ActionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A>,
    S extends string
>(plugin: Database.Plugin<CS, RS, A, TD, S>): Database<FromSchemas<CS>, FromSchemas<RS>, A, ToActionFunctions<TD>, S> {
    const systems = plugin.systems ?? ({} as any);
    const transactions = plugin.transactions ?? ({} as any);
    const storeSchema: Store.Schema<CS, RS, A> = {
        components: plugin.components ?? ({} as CS),
        resources: plugin.resources ?? ({} as RS),
        archetypes: plugin.archetypes ?? ({} as A),
    };
    return createDatabase(Store.create(storeSchema), transactions, systems) as any;
}

function createDatabaseFromStoreTransactionsAndSystems<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends ActionDeclarations<C, R, A>,
    const S extends string
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
    systemDeclarations: { readonly [K in S]: {
        readonly create: (db: Database<C, R, A, ToActionFunctions<TD>, S>) => (() => void | Promise<void>) | void;
        readonly schedule?: { readonly before?: readonly S[]; readonly after?: readonly S[]; readonly during?: readonly S[] };
    } }
): Database<C, R, A, ToActionFunctions<TD>, S> {
    type T = ToActionFunctions<TD> & Service;
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

    // Calculate system execution order
    const systemOrder = calculateSystemOrder(systemDeclarations as any);

    // Create partial database for system initialization (two-phase)
    const partialDatabase: any = {
        serviceName: "ecs-database-service",
        ...reconcilingDatabase,
        store: store as Store<C, R, A>,
        transactions,
        system: {
            functions: {},  // Empty initially
            order: systemOrder
        },
        extend: undefined  // Will be set later
    };

    // Instantiate system functions with partial database
    const systemFunctions: any = {};
    for (const name in systemDeclarations) {
        systemFunctions[name] = systemDeclarations[name].create(partialDatabase);
    }
    partialDatabase.system.functions = systemFunctions;

    const extend = <
        P extends Database.Plugin<any, any, any, any, any>
    >(
        plugin: P,
    ) => {
        // Delegate to reconcilingDatabase which handles store/transactionalStore extension
        reconcilingDatabase.extend(plugin);
        
        const pluginTransactions = plugin.transactions ?? {};
        
        // Add transaction wrappers for the new transactions
        addTransactionWrappers(pluginTransactions);

        // If plugin has new systems, we need to recreate the database with merged systems
        if (plugin.systems && Object.keys(plugin.systems).length > 0) {
            // Merge system declarations
            const mergedSystemDeclarations = {
                ...systemDeclarations,
                ...plugin.systems
            } as any;

            // Create new database with merged systems
            return createDatabaseFromStoreTransactionsAndSystems(
                store,
                { ...transactionDeclarations, ...pluginTransactions } as any,
                mergedSystemDeclarations
            ) as any;
        }

        // No new systems, return the same database instance
        return partialDatabase as any;
    };

    partialDatabase.extend = extend;

    return partialDatabase as Database<C, R, A, T, S> & { extend: typeof extend };
}

function createDatabaseFromStoreAndTransactions<
    const C extends Components,
    const R extends ResourceComponents,
    const A extends ArchetypeComponents<StringKeyof<C>>,
    const TD extends ActionDeclarations<C, R, A>
>(
    store: Store<C, R, A>,
    transactionDeclarations: TD,
): Database<C, R, A, ToActionFunctions<TD>, never> {
    type T = ToActionFunctions<TD> & Service;
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

    const extend = <
        S extends Database.Plugin<any, any, any, any, any>
    >(
        schema: S,
    ) => {
        // Delegate to reconcilingDatabase which handles store/transactionalStore extension
        reconcilingDatabase.extend(schema);
        // Add transaction wrappers for the new transactions
        addTransactionWrappers(schema.transactions);

        return database as unknown as Database<
            C & (S extends Database.Plugin<infer XC, any, any, any, any> ? FromSchemas<XC> : never),
            R & (S extends Database.Plugin<any, infer XR, any, any, any> ? FromSchemas<XR> : never),
            A & (S extends Database.Plugin<any, any, infer XA, any, any> ? XA : never),
            T & (S extends Database.Plugin<any, any, any, infer XTD, any> ? ToActionFunctions<XTD> : never),
            never
        >;
    };

    const database = {
        serviceName: "ecs-database-service",
        ...reconcilingDatabase,
        store: store as Store<C, R, A>,
        transactions,
        system: {
            functions: {} as any,
            order: [] as never[][]
        },
        extend,
    } as Database<C, R, A, T, never> & { extend: typeof extend };

    return database;
}

