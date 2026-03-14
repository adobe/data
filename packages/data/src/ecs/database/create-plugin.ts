// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, SystemFunction, ServiceFactories, FromServiceFactories, FromComputedFactories, type PluginComputedFactories } from "./database.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";
import type { ArchetypeComponents } from "../store/archetype-components.js";
import type { TransactionDeclarations, ToTransactionFunctions } from "../store/transaction-functions.js";
import type { ActionDeclarations, ToActionFunctions } from "../store/action-functions.js";
import type { FromSchemas } from "../../schema/index.js";
import type { StringKeyof, Simplify, NoInfer } from "../../types/types.js";
import { CombinePlugins, combinePlugins } from "./combine-plugins.js";
import { Store } from "../store/store.js";

type RemoveIndex<T> = Simplify<{
    [K in keyof T as
    string extends K ? never :
    number extends K ? never :
    symbol extends K ? never :
    K
    ]: T[K]
}>;

/**
 * Database type with services from extended plugin.
 * Used for typing service factory parameters and actions/systems that access services.
 */
type DatabaseWithServices<
    CS, RS, A, TD, S extends string, AD, XP extends Database.Plugin
> = Database<
    FromSchemas<CS & XP['components']>,
    FromSchemas<RS & XP['resources']>,
    A & XP['archetypes'],
    ToTransactionFunctions<TD & XP['transactions']>,
    S | StringKeyof<XP['systems']>,
    ToActionFunctions<AD & XP['actions']>,
    FromServiceFactories<XP['services']>
>;

function validatePropertyOrder(plugins: Record<string, unknown>): void {
    const expectedOrder = ['extends', 'services', 'components', 'resources', 'archetypes', 'computed', 'transactions', 'actions', 'systems'];
    const actualKeys = Object.keys(plugins);
    const definedKeys = actualKeys.filter(key => key in plugins);

    for (let i = 0; i < definedKeys.length; i++) {
        const key = definedKeys[i];
        const expectedIndex = expectedOrder.indexOf(key);
        if (expectedIndex === -1) {
            throw new Error(`Database.Plugin.create: Unknown property "${key}". Valid properties are: ${expectedOrder.join(', ')}`);
        }
        // Check if any previous key should come after this one
        for (let j = 0; j < i; j++) {
            const prevKey = definedKeys[j];
            const prevExpectedIndex = expectedOrder.indexOf(prevKey);
            if (prevExpectedIndex > expectedIndex) {
                throw new Error(
                    `Database.Plugin.create: Property "${key}" must come before "${prevKey}". ` +
                    `Required order: ${expectedOrder.filter(k => definedKeys.includes(k)).join(', ')}`
                );
            }
        }
    }
}

/**
 * Creates a Database.Plugin from a plugin descriptor.
 * 
 * **IMPORTANT: Property Order Requirement**
 * 
 * Properties MUST be defined in this exact order:
 * 1. extends (optional) - Base plugin to extend
 * 2. services (optional) - Service factory functions
 * 3. components (optional) - Component schema definitions
 * 4. resources (optional) - Resource schema definitions
 * 5. archetypes (optional) - Archetype definitions
 * 6. computed (optional) - Computed observe factories (each returns Observe<unknown>)
 * 7. transactions (optional) - Transaction declarations
 * 8. actions (optional) - Action declarations
 * 9. systems (optional) - System declarations
 * 
 * Example:
 * ```ts
 * Database.Plugin.create({
 *   extends: basePlugin,     // 1. extends first
 *   services: {              // 2. services last
 *     myService: (db) => createMyService(db.resources.config),
 *   }
 *   components: { ... },     // 3. components
 *   resources: { ... },      // 4. resources
 *   archetypes: { ... },     // 5. archetypes
 *   computed: { ... },       // 6. computed
 *   transactions: { ... },   // 7. transactions
 *   actions: { ... },        // 8. actions
 *   systems: { ... },        // 9. systems
 * })
 * ```
 * 
 * **Services**: Factory functions that create singleton services. Services from
 * extended plugins are initialized first, ensuring proper dependency order.
 * Service factories receive the database with access to extended plugin's
 * resources, transactions, actions, and services.
 *
 * **Computed**: Factory functions that return values extending Observe<unknown>. Each receives
 * the full db (CS, RS, A from current plugin and extend). Database keeps ComputedFactories
 * (unknown) for flexibility; createPlugin constrains to PluginComputedFactories.
 *
 * @throws Error if properties are not in the correct order
 */
type FullDBForPlugin<
    CS, RS, A, TD, S extends string, AD, XP extends Database.Plugin,
    SVF extends ServiceFactories<Database.FromPlugin<XP>>
> = Database<
    FromSchemas<CS & XP['components']>,
    FromSchemas<RS & XP['resources']>,
    A & XP['archetypes'],
    ToTransactionFunctions<TD & XP['transactions']>,
    S | StringKeyof<XP['systems']>,
    ToActionFunctions<AD & XP['actions']>,
    FromServiceFactories<RemoveIndex<SVF> & XP['services']>
>;

export function createPlugin<
    const XP extends Database.Plugin<{}, {}, {}, {}, never, {}, {}, {}>,
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<RemoveIndex<CS> & XP['components']>>,
    const TD extends TransactionDeclarations<FromSchemas<RemoveIndex<CS> & XP['components']>, FromSchemas<RemoveIndex<RS> & XP['resources']>, RemoveIndex<A> & XP['archetypes']>,
    const AD,
    const S extends string = never,
    const SVF extends ServiceFactories<Database.FromPlugin<XP>> = {},
    const CVF extends PluginComputedFactories<FullDBForPlugin<RemoveIndex<CS>, RemoveIndex<RS>, RemoveIndex<A>, RemoveIndex<TD>, S, RemoveIndex<AD> & XP['actions'], XP, RemoveIndex<SVF>>> = {},
>(
    plugins: {
        extends?: XP,
        services?: SVF & {
            readonly [K: string]: (db: Database.FromPlugin<XP>) => unknown
        },
        components?: CS,
        resources?: RS,
        archetypes?: A,
        computed?: CVF & PluginComputedFactories<FullDBForPlugin<RemoveIndex<CS>, RemoveIndex<RS>, RemoveIndex<A>, {}, string, RemoveIndex<AD> & XP['actions'], XP, RemoveIndex<SVF>>>,
        transactions?: TD,
        actions?: AD & {
            readonly [K: string]: (db: Database<
                FromSchemas<RemoveIndex<CS> & XP['components']>,
                FromSchemas<RemoveIndex<RS> & XP['resources']>,
                RemoveIndex<A> & XP['archetypes'],
                ToTransactionFunctions<RemoveIndex<TD> & XP['transactions']>,
                S | StringKeyof<XP['systems']>,
                ToActionFunctions<XP['actions']>,
                FromServiceFactories<RemoveIndex<SVF> & XP['services']>,
                FromComputedFactories<RemoveIndex<CVF> & XP['computed']>
            >, input?: any) => any
        }
        systems?: { readonly [K in S]: {
            readonly create: (db: Database<
                FromSchemas<RemoveIndex<CS> & XP['components']>,
                FromSchemas<RemoveIndex<RS> & XP['resources']>,
                RemoveIndex<A> & XP['archetypes'],
                ToTransactionFunctions<RemoveIndex<TD> & XP['transactions']>,
                S | StringKeyof<XP['systems']>,
                ToActionFunctions<RemoveIndex<AD> & XP['actions']>,
                FromServiceFactories<RemoveIndex<SVF> & XP['services']>,
                FromComputedFactories<RemoveIndex<CVF> & XP['computed']>
            > & {
                readonly store: Store<
                    FromSchemas<RemoveIndex<CS> & XP['components']>,
                    FromSchemas<RemoveIndex<RS> & XP['resources']>,
                    RemoveIndex<A> & XP['archetypes']
                >
            }) => SystemFunction | void;
            readonly schedule?: {
                readonly before?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']>, K>>[];
                readonly after?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']>, K>>[];
                readonly during?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']>, K>>[];
            }
        }
        },
    },
): CombinePlugins<[XP, Database.Plugin<
    RemoveIndex<CS>,
    RemoveIndex<RS>,
    RemoveIndex<A>,
    RemoveIndex<TD>,
    S,
    AD & ActionDeclarations<FromSchemas<RemoveIndex<CS>>, FromSchemas<RemoveIndex<RS>>, RemoveIndex<A>, ToTransactionFunctions<RemoveIndex<TD>>, S>,
    RemoveIndex<SVF>,
    RemoveIndex<CVF>
>]> {
    validatePropertyOrder(plugins);

    // Normalize plugins descriptor to a plugin object in correct order
    const plugin: any = {
        services: plugins.services ?? {},
        components: plugins.components ?? {},
        resources: plugins.resources ?? {},
        archetypes: plugins.archetypes ?? {},
        computed: plugins.computed ?? {},
        transactions: plugins.transactions ?? {},
        actions: plugins.actions ?? {},
        systems: plugins.systems ?? {},
    };

    if (plugins.extends) {
        return combinePlugins(plugins.extends, plugin) as any;
    }
    return plugin as any;
}