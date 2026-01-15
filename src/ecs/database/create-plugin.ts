// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, SystemFunction } from "./database.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";
import type { ArchetypeComponents } from "../store/archetype-components.js";
import type { TransactionDeclarations, ToTransactionFunctions } from "../store/transaction-functions.js";
import type { ActionDeclarations, ToActionFunctions } from "../store/action-functions.js";
import type { FromSchemas } from "../../schema/index.js";
import type { StringKeyof, Simplify, NoInfer } from "../../types/types.js";
import { CombinePlugins, combinePlugins } from "./combine-plugins.js";

type RemoveIndex<T> = Simplify<{
    [K in keyof T as
    string extends K ? never :
    number extends K ? never :
    symbol extends K ? never :
    K
    ]: T[K]
}>;

function validatePropertyOrder(plugins: Record<string, unknown>): void {
    const expectedOrder = ['extends', 'components', 'resources', 'archetypes', 'transactions', 'actions', 'systems'];
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
 * 2. components (optional) - Component schema definitions
 * 3. resources (optional) - Resource schema definitions
 * 4. archetypes (optional) - Archetype definitions
 * 5. transactions (optional) - Transaction declarations
 * 6. actions (optional) - Action declarations
 * 7. systems (optional) - System declarations
 * 
 * Example:
 * ```ts
 * Database.Plugin.create({
 *   extends: basePlugin,     // 1. extends first
 *   components: { ... },     // 2. components
 *   resources: { ... },      // 3. resources
 *   archetypes: { ... },     // 4. archetypes
 *   transactions: { ... },   // 5. transactions
 *   actions: { ... },        // 6. actions
 *   systems: { ... }         // 7. systems last
 * })
 * ```
 * 
 * @throws Error if properties are not in the correct order
 */
export function createPlugin<
    const XP extends Database.Plugin<{}, {}, {}, {}, never, {}>,
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<RemoveIndex<CS> & XP['components']>>,
    const TD extends TransactionDeclarations<FromSchemas<RemoveIndex<CS> & XP['components']>, FromSchemas<RemoveIndex<RS> & XP['resources']>, RemoveIndex<A> & XP['archetypes']>,
    const AD,
    const S extends string = never,
>(
    plugins: {
        extends?: XP,
        components?: CS,
        resources?: RS,
        archetypes?: A,
        transactions?: TD,
        actions?: AD & {
            readonly [K: string]: (db: Database<
                FromSchemas<RemoveIndex<CS> & XP['components']>,
                FromSchemas<RemoveIndex<RS> & XP['resources']>,
                RemoveIndex<A> & XP['archetypes'],
                ToTransactionFunctions<RemoveIndex<TD> & XP['transactions']>,
                string,
                ToActionFunctions<XP['actions']>
            >, input?: any) => any
        }
        systems?: { readonly [K in S]: {
            readonly create: (db: Database<
                FromSchemas<RemoveIndex<CS> & XP['components']>,
                FromSchemas<RemoveIndex<RS> & XP['resources']>,
                RemoveIndex<A> & XP['archetypes'],
                ToTransactionFunctions<RemoveIndex<TD> & XP['transactions']>,
                string,
                ToActionFunctions<RemoveIndex<AD> & XP['actions']>
            >) => SystemFunction | void;
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
    AD & ActionDeclarations<FromSchemas<RemoveIndex<CS>>, FromSchemas<RemoveIndex<RS>>, RemoveIndex<A>, ToTransactionFunctions<RemoveIndex<TD>>, S>>
]> {
    validatePropertyOrder(plugins);

    // Normalize plugins descriptor to a plugin object in correct order
    const plugin: any = {
        components: plugins.components ?? {},
        resources: plugins.resources ?? {},
        archetypes: plugins.archetypes ?? {},
        transactions: plugins.transactions ?? {},
        actions: plugins.actions ?? {},
        systems: plugins.systems ?? {},
    };

    if (plugins.extends) {
        return combinePlugins(plugins.extends, plugin) as any;
    }
    return plugin as any;
}