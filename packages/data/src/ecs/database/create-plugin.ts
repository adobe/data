// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, SystemFunction, ServiceFactories, FromServiceFactories, FromComputedFactories, type PluginComputedFactories, type IndexDeclarations } from "./database.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";
import type { ArchetypeComponents } from "../store/archetype-components.js";
import type { TransactionDeclarations, ToTransactionFunctions } from "../store/transaction-functions.js";
import type { ToActionFunctions } from "../store/action-functions.js";
import type { FromSchemas } from "../../schema/index.js";
import type { PartitionKeysOf } from "../store/partition.js";
import type { StringKeyof, NoInfer, RemoveIndex } from "../../types/types.js";
import { combinePlugins } from "./combine-plugins.js";
import { Store } from "../store/store.js";


/**
 * Direct-intersection return type for createPlugin.
 *
 * Uses direct property access (`XP['components']`) instead of conditional
 * inference (`CombinePlugins<[XP, ...]>`) to avoid expensive 8-way type
 * expansion that amplifies TS7056 serialization overflow.
 */
type CreatePluginResult<
    XP extends Database.Plugin,
    CS, RS, A, TD, S extends string, AD, SVF, CVF, IX
> = Database.Plugin<
    XP['components'] & CS,
    XP['resources'] & RS,
    XP['archetypes'] & A,
    XP['transactions'] & TD,
    S | StringKeyof<XP['systems']>,
    XP['actions'] & AD,
    XP['services'] & SVF,
    XP['computed'] & CVF,
    XP['indexes'] & IX
>;

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
    const expectedOrder = ['imports', 'extends', 'services', 'components', 'resources', 'archetypes', 'indexes', 'computed', 'transactions', 'actions', 'systems'];
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
 * 1. imports (optional) - Dependency plugins whose types are visible to local
 *    declarations but NOT re-exported into the result
 * 2. extends (optional) - Base plugin to extend (types re-exported into result)
 * 3. services (optional) - Service factory functions
 * 4. components (optional) - Component schema definitions
 * 5. resources (optional) - Resource schema definitions
 * 6. archetypes (optional) - Archetype definitions
 * 7. indexes (optional) - Index declarations over components
 * 8. computed (optional) - Computed observe factories (each returns Observe<unknown>)
 * 9. transactions (optional) - Transaction declarations
 * 10. actions (optional) - Action declarations
 * 11. systems (optional) - System declarations
 *
 * Example:
 * ```ts
 * Database.Plugin.create({
 *   imports: depPlugin,      // 1. imports first
 *   extends: basePlugin,     // 2. extends
 *   services: {              // 3. services
 *     myService: (db) => createMyService(db.resources.config),
 *   }
 *   components: { ... },     // 4. components
 *   resources: { ... },      // 5. resources
 *   archetypes: { ... },     // 6. archetypes
 *   indexes: { ... },        // 7. indexes
 *   computed: { ... },       // 8. computed
 *   transactions: { ... },   // 9. transactions
 *   actions: { ... },        // 10. actions
 *   systems: { ... },        // 11. systems
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
    SVF extends ServiceFactories<Database.FromPlugin<XP>>,
    IX = {}
> = Database<
    FromSchemas<CS & XP['components']>,
    FromSchemas<RS & XP['resources']>,
    A & XP['archetypes'],
    ToTransactionFunctions<TD & XP['transactions']>,
    S | StringKeyof<XP['systems']>,
    ToActionFunctions<AD & XP['actions']>,
    FromServiceFactories<RemoveIndex<SVF> & XP['services']>,
    // 8: CV — the base plugin's already-resolved computeds. XP is
    //    AmbientPlugin<XP, IP> at the call sites, so XP['computed'] carries the
    //    `extends` base + `imports` deps' computeds — all fully constructed, so
    //    surfacing them here is sound (nothing in-progress, no circularity).
    //    The current plugin's OWN computeds (CVF) are deliberately NOT a
    //    parameter to this type, so they never flow into their own factory db:
    //    a computed cannot reference an in-progress sibling, but it CAN compose
    //    on a base plugin's computed with full types — same rule actions/systems
    //    already follow. Resolves to `{}` for the common no-base-computeds case.
    FromComputedFactories<XP['computed']>,
    // 9: IX — thread the index declarations so `db.indexes` is populated inside
    //    computed factories, same as the actions/systems `db` already does.
    //    XP is AmbientPlugin<XP, IP> at the call sites, so XP['indexes'] carries
    //    both extends-base and imports-dep indexes; `IX` adds the plugin's own.
    IX & XP['indexes']
>;

/**
 * Ambient plugin context used for *parameter typing only*: the union of the
 * `extends` base (XP) and the `imports` dependencies (IP).
 *
 * Local declarations (action/system `db`, the component/archetype/transaction
 * constraints) are typed against this ambient so they see BOTH bases with full
 * type safety. Crucially, this alias does NOT appear in createPlugin's return
 * type — only XP (the `extends` base) flows into the result via
 * CreatePluginResult. That asymmetry is the whole point of `imports`: a plugin
 * can depend on another's types without re-exporting them, so the result type
 * stays O(local members) instead of O(accumulated chain).
 *
 * Direct property access (not CombinePlugins<[XP, IP]>) to avoid the 8-way
 * conditional expansion that amplifies TS7056. For the common `extends`-only
 * case IP is the empty-plugin constraint, so every `& IP['x']` reduces to
 * `& {}` (identity on the object-typed buckets) — no cost or behavior change.
 */
type AmbientPlugin<XP extends Database.Plugin, IP extends Database.Plugin> = Database.Plugin<
    XP['components'] & IP['components'],
    XP['resources'] & IP['resources'],
    XP['archetypes'] & IP['archetypes'],
    XP['transactions'] & IP['transactions'],
    StringKeyof<XP['systems']> | StringKeyof<IP['systems']>,
    XP['actions'] & IP['actions'],
    XP['services'] & IP['services'],
    XP['computed'] & IP['computed'],
    XP['indexes'] & IP['indexes']
>;

export function createPlugin<
    const XP extends Database.Plugin<{}, {}, {}, {}, never, {}, {}, {}, {}>,
    const IP extends Database.Plugin<{}, {}, {}, {}, never, {}, {}, {}, {}>,
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<RemoveIndex<CS> & XP['components'] & IP['components']>>,
    const IX extends IndexDeclarations<FromSchemas<RemoveIndex<CS> & XP['components'] & IP['components']>, RemoveIndex<A> & XP['archetypes'] & IP['archetypes']>,
    const TD extends TransactionDeclarations<FromSchemas<RemoveIndex<CS> & XP['components'] & IP['components']>, FromSchemas<RemoveIndex<RS> & XP['resources'] & IP['resources']>, RemoveIndex<A> & XP['archetypes'] & IP['archetypes'], RemoveIndex<IX> & XP['indexes'] & IP['indexes'], PartitionKeysOf<RemoveIndex<CS> & XP['components'] & IP['components']>>,
    const AD,
    const S extends string = never,
    const SVF extends ServiceFactories<Database.FromPlugin<AmbientPlugin<XP, IP>>> = {},
    const CVF extends PluginComputedFactories<FullDBForPlugin<RemoveIndex<CS>, RemoveIndex<RS>, RemoveIndex<A>, RemoveIndex<TD>, S, RemoveIndex<AD> & XP['actions'] & IP['actions'], AmbientPlugin<XP, IP>, RemoveIndex<SVF>, RemoveIndex<IX>>> = {},
>(
    plugins: {
        imports?: IP,
        extends?: XP,
        services?: SVF & {
            readonly [K: string]: (db: Database.FromPlugin<AmbientPlugin<XP, IP>>) => unknown
        },
        components?: CS,
        resources?: RS,
        archetypes?: A,
        indexes?: IX,
        computed?: CVF & PluginComputedFactories<FullDBForPlugin<RemoveIndex<CS>, RemoveIndex<RS>, RemoveIndex<A>, {}, string, RemoveIndex<AD> & XP['actions'] & IP['actions'], AmbientPlugin<XP, IP>, RemoveIndex<SVF>, RemoveIndex<IX>>>,
        transactions?: TD,
        actions?: AD & {
            readonly [K: string]: (db: Database<
                FromSchemas<RemoveIndex<CS> & XP['components'] & IP['components']>,
                FromSchemas<RemoveIndex<RS> & XP['resources'] & IP['resources']>,
                RemoveIndex<A> & XP['archetypes'] & IP['archetypes'],
                ToTransactionFunctions<RemoveIndex<TD> & XP['transactions'] & IP['transactions']>,
                S | StringKeyof<XP['systems']> | StringKeyof<IP['systems']>,
                ToActionFunctions<XP['actions'] & IP['actions']>,
                FromServiceFactories<RemoveIndex<SVF> & XP['services'] & IP['services']>,
                FromComputedFactories<RemoveIndex<CVF> & XP['computed'] & IP['computed']>,
                RemoveIndex<IX> & XP['indexes'] & IP['indexes']
            >, input?: any) => any
        }
        systems?: { readonly [K in S]: {
            readonly create: (db: Database<
                FromSchemas<RemoveIndex<CS> & XP['components'] & IP['components']>,
                FromSchemas<RemoveIndex<RS> & XP['resources'] & IP['resources']>,
                RemoveIndex<A> & XP['archetypes'] & IP['archetypes'],
                ToTransactionFunctions<RemoveIndex<TD> & XP['transactions'] & IP['transactions']>,
                S | StringKeyof<XP['systems']> | StringKeyof<IP['systems']>,
                ToActionFunctions<RemoveIndex<AD> & XP['actions'] & IP['actions']>,
                FromServiceFactories<RemoveIndex<SVF> & XP['services'] & IP['services']>,
                FromComputedFactories<RemoveIndex<CVF> & XP['computed'] & IP['computed']>,
                RemoveIndex<IX> & XP['indexes'] & IP['indexes']
            > & {
                readonly store: Store<
                    FromSchemas<RemoveIndex<CS> & XP['components'] & IP['components']>,
                    FromSchemas<RemoveIndex<RS> & XP['resources'] & IP['resources']>,
                    RemoveIndex<A> & XP['archetypes'] & IP['archetypes']
                >
                services: { -readonly [K in keyof FromServiceFactories<RemoveIndex<SVF> & XP['services'] & IP['services']>]: FromServiceFactories<RemoveIndex<SVF> & XP['services'] & IP['services']>[K] }
            }) => SystemFunction | void;
            readonly schedule?: {
                readonly before?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']> | StringKeyof<IP['systems']>, K>>[];
                readonly after?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']> | StringKeyof<IP['systems']>, K>>[];
                readonly during?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']> | StringKeyof<IP['systems']>, K>>[];
            }
        }
        },
    },
): CreatePluginResult<XP, RemoveIndex<CS>, RemoveIndex<RS>, RemoveIndex<A>, RemoveIndex<TD>, S, AD, RemoveIndex<SVF>, RemoveIndex<CVF>, RemoveIndex<IX>> {
    validatePropertyOrder(plugins);

    // Normalize plugins descriptor to a plugin object in correct order
    const plugin: any = {
        services: plugins.services ?? {},
        components: plugins.components ?? {},
        resources: plugins.resources ?? {},
        archetypes: plugins.archetypes ?? {},
        indexes: plugins.indexes ?? {},
        computed: plugins.computed ?? {},
        transactions: plugins.transactions ?? {},
        actions: plugins.actions ?? {},
        systems: plugins.systems ?? {},
    };

    // `imports` differs from `extends` only at the TYPE level: the imported
    // plugins' members are NOT declared in this plugin's result type, so they
    // don't propagate through downstream result types (the source of the
    // quadratic `extends` blowup). At RUNTIME, however, imports merge in exactly
    // like extends — so the imported components/resources/transactions/etc. are
    // present in the assembled database without the consumer having to re-list
    // them in the top-level combine. Order: imports first, then extends, then
    // this plugin's own declarations (preserves service initialization order).
    const bases: Database.Plugin[] = [];
    if (plugins.imports) bases.push(plugins.imports);
    if (plugins.extends) bases.push(plugins.extends);
    if (bases.length > 0) {
        return combinePlugins(...bases, plugin) as any;
    }
    return plugin as any;
}