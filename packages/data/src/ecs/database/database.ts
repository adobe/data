// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Archetype, ArchetypeId, ReadonlyArchetype } from "../archetype/index.js";
import { ResourceComponents } from "../store/resource-components.js";
import { ReadonlyStore, Store } from "../store/index.js";
import { Entity } from "../entity/entity.js";
import { EntityReadValues } from "../store/core/index.js";
import { Observe } from "../../observe/index.js";
import { TransactionResult } from "./transactional-store/index.js";
import { TransactionEnvelope } from "./reconciling/reconciling-database.js";
import { StringKeyof, RemoveIndex } from "../../types/types.js";
import { Components } from "../store/components.js";
import { ArchetypeComponents } from "../store/archetype-components.js";
import { RequiredComponents } from "../required-components.js";
import { EntitySelectOptions } from "../store/entity-select-options.js";
import { Filter } from "../../table/select-rows.js";
import type { Service } from "../../service/index.js";
import { createDatabase, type DatabaseSyncOptions } from "./public/create-database.js";
import { observeSelectDeep as _observeSelectDeep } from "./public/observe-select-deep.js";
import { ResourceSchemas } from "../resource-schemas.js";
import { ComponentSchemas } from "../component-schemas.js";
import { FromSchemas } from "../../schema/index.js";
import type {
  TransactionDeclarations,
  TransactionFunctions,
  ToTransactionFunctions,
} from "../store/transaction-functions.js";
import type {
  ActionDeclarations,
  ActionFunctions,
  ToActionFunctions,
} from "../store/action-functions.js";
import { createPlugin } from "./create-plugin.js";
import { combinePlugins } from "./combine-plugins.js";

export type SystemFunction = () => void | Promise<void>;
export type SystemDeclaration = {
  readonly create: (db: Database<any, any, any, any, any, any> & { store: Store<any, any, any> }) => SystemFunction | void;
  /**
   * Scheduling constraints for system execution order.
   * - `before`: Hard constraint - this system must run before the listed systems
   * - `after`: Hard constraint - this system must run after the listed systems
   * - `during`: Soft constraint - prefer to run in the same tier as the listed systems, if dependencies allow
   */
  readonly schedule?: {
    readonly before?: readonly string[];
    readonly after?: readonly string[];
    readonly during?: readonly string[];
  }
}
export type SystemDeclarations<S extends string> = { readonly [K in S]: SystemDeclaration }

/**
 * Service factories map - functions that create services from the database.
 */
export type ServiceFactories<DB = any> = { readonly [K: string]: (db: DB) => unknown };

/**
 * Extracts service types from service factories.
 */
export type FromServiceFactories<SF> = {
  [K in keyof SF]: SF[K] extends (db: any) => infer R ? R : never
};

/**
 * Computed factories map - functions that create computed values from the database.
 * Used on Database and Plugin for flexible typing (return type unknown).
 */
export type ComputedFactories<DB = any> = { readonly [K: string]: (db: DB) => unknown };

/**
 * Extracts computed value types from computed factories.
 */
export type FromComputedFactories<CF> = {
  [K in keyof CF]: CF[K] extends (db: any) => infer R ? R : never
};

/**
 * Valid return type for a plugin computed factory.
 * Either a direct Observe<T> or a function with any args that returns Observe<T>.
 */
export type PluginComputedValue = Observe<unknown> | ((...args: any[]) => Observe<unknown>);

/**
 * Computed factories for plugin descriptors. Constrains each factory to return
 * a PluginComputedValue (direct observable or function returning observable).
 * Use this in createPlugin; Database keeps ComputedFactories (unknown) for flexibility.
 */
export type PluginComputedFactories<DB = any> = { readonly [K: string]: (db: DB) => PluginComputedValue };

/**
 * Plugin-level map of indexes. Keys are user-chosen index names; values are
 * `Database.Index` declarations whose `components` tuple must reference real
 * keys of `C`. The constraint is shaped to allow `RemoveIndex<...>` to strip
 * the index signature and recover the literal map at the call site (same
 * pattern as `ArchetypeComponents`).
 */
export type IndexDeclarations<C extends Components = any> = {
  readonly [name: string]: Database.Index<C, readonly [StringKeyof<C>, ...StringKeyof<C>[]], boolean>;
};

export interface Database<
  C extends Components = {},
  R extends ResourceComponents = {},
  A extends ArchetypeComponents<StringKeyof<C>> = {},
  F extends TransactionFunctions = {},
  S extends string = never,
  AF extends ActionFunctions = {},
  SV = {},
  CV = unknown,
  IX extends IndexDeclarations<C> = {},
> extends ReadonlyStore<C, R, A>, Service {
  readonly transactions: F & Service;
  readonly actions: AF & Service;
  readonly services: SV;
  readonly computed: CV;
  /**
   * Lookup handles for the indexes declared by plugins on this database.
   * Each key in `IX` becomes a `Database.Index.Handle` whose method shape
   * is narrowed by the declared key tuple and unique flag.
   *
   * The handles are also the implementation path used by `db.select` /
   * `db.observe.select` when a `where` / `order` matches a declared
   * index — call sites do not need to be aware of which index served
   * the query, but the same handle is what runs underneath.
   */
  readonly indexes: { readonly [K in keyof IX]: Database.Index.Handle<C, IX[K]> };
  readonly observe: {
    readonly components: { readonly [K in StringKeyof<C>]: Observe<void> };
    readonly resources: { readonly [K in StringKeyof<R>]: Observe<R[K]> };
    readonly transactions: Observe<TransactionResult<C>>;
    /**
     * Fires once for every locally-initiated envelope produced by the
     * transaction wrappers (`db.transactions.X(args)`). Replays inside the
     * reconciler and inbound `db.apply()` calls do NOT fire it. The
     * `intent` reflects the wrapper's decision regardless of whether the
     * envelope was applied locally as a transient (deferred-commit / sync
     * mode) or as a commit (local-only mode).
     *
     * Sync services route forwarding by `intent`:
     *   - `"commit"`    → propose to the server (reliable)
     *   - `"transient"` → relay to peers (lossy)
     *   - `"cancel"`    → cancel a pending transient (reliable)
     */
    readonly envelopes: Observe<{
        envelope: TransactionEnvelope;
        result: TransactionResult<C> | undefined;
        intent: "commit" | "transient" | "cancel";
    }>;
    entity<T extends RequiredComponents>(id: Entity, minArchetype?: ReadonlyArchetype<T> | Archetype<T>): Observe<Readonly<T> & EntityReadValues<C> | null>;
    entity(id: Entity): Observe<EntityReadValues<C> | null>;
    archetype(id: ArchetypeId): Observe<void>;
    select<
      Include extends StringKeyof<C>,
      T extends Include
    >(
      include: readonly Include[] | ReadonlySet<string>,
      options?: EntitySelectOptions<C, Pick<C & RequiredComponents, T>>
    ): Observe<readonly Entity[]>;
  }
  /**
   * Wipes all entities and resets all resources to their plugin defaults,
   * preserving database identity (observers, transaction wrappers, sync
   * options stay intact). Equivalent in observable state to a freshly
   * constructed Database with the same plugin.
   *
   * O(num_archetypes + num_resources) — does not walk individual entities.
   * Clears any in-flight reconciler transient queue.
   */
  readonly reset: () => void;
  /**
   * Apply a remotely-originated transaction envelope to the database. Used
   * by sync services to feed in inbound commits and transients. Does not
   * fire `observe.envelopes`.
   */
  readonly apply: (envelope: TransactionEnvelope) => TransactionResult<C> | undefined;
  /**
   * Cancel a previously-applied transient envelope by its compound
   * `(userId, id)` key. Used by sync services to forward server-broadcast
   * cancellations.
   */
  readonly cancel: (id: number, userId?: number | string) => void;
  /**
   * The sync options the database was created with, or `undefined` for a
   * local-only database. Sync services read this to (a) confirm the
   * database was created in sync mode and (b) recover the `userId` for
   * authentication / logging without having to thread it through
   * separately.
   */
  readonly sync: DatabaseSyncOptions | undefined;
  readonly system: {
    /** System create() return value, or null when create() returns void. Key is always present. */
    readonly functions: { readonly [K in S]: SystemFunction | null };
    /** Tier order for execution. Looser type allows extended dbs to be assignable to base. */
    readonly order: ReadonlyArray<ReadonlyArray<string>>;
  }
  toData(): unknown
  fromData(data: unknown): void
  extend<P extends Database.Plugin>(plugin: P): Database<
    C & FromSchemas<RemoveIndex<P['components']>>,
    R & FromSchemas<RemoveIndex<P['resources']>>,
    A & RemoveIndex<P['archetypes']>,
    F & ToTransactionFunctions<RemoveIndex<P['transactions']>>,
    S | StringKeyof<P['systems']>,
    AF & ToActionFunctions<RemoveIndex<P['actions']>>,
    SV & FromServiceFactories<RemoveIndex<P['services']>>,
    CV & FromComputedFactories<RemoveIndex<P['computed']>>,
    IX & RemoveIndex<P['indexes']>
  >;
}

export namespace Database {
  /**
   * Converts a Plugin type to its corresponding Database type.
   * Uses direct property access (P['components']) instead of conditional inference
   * (P extends Plugin<infer CS, ...> ? CS : never) to avoid expensive 8-way type
   * expansion that amplifies TS7056 serialization overflow in deep extends chains.
   */
  export type FromPlugin<P extends Database.Plugin> = Database<
    FromSchemas<RemoveIndex<P['components']>>,
    FromSchemas<RemoveIndex<P['resources']>>,
    RemoveIndex<P['archetypes']>,
    ToTransactionFunctions<RemoveIndex<P['transactions']>>,
    StringKeyof<P['systems']>,
    ToActionFunctions<RemoveIndex<P['actions']>>,
    FromServiceFactories<RemoveIndex<P['services']>>,
    FromComputedFactories<RemoveIndex<P['computed']>>,
    RemoveIndex<P['indexes']>
  >;

  export const create = createDatabase;

  export const is = (value: unknown): value is Database => {
    return value !== null && typeof value === "object" && "transactions" in value && "actions" in value && "store" in value && "observe" in value && "system" in value && "extend" in value;
  }

  export const observeSelectDeep = _observeSelectDeep;

  /**
   * Type-level declaration of an index over one or more components.
   *
   * - `components`: ordered, non-empty tuple of component keys. Order is
   *   significant — it defines both the sort order the index produces and
   *   the prefixes of a `where` / `order` clause the index can serve.
   * - `unique`: when `true`, at most one entity may hold each key tuple.
   *   Required to expose `Handle.get`. Defaults to `false`.
   *
   * Every key in `components` is statically checked against the database's
   * component map `C`; an unknown name is a compile error at the plugin
   * declaration site.
   */
  export type Index<
    C extends Components = any,
    Keys extends readonly [StringKeyof<C>, ...StringKeyof<C>[]] = any,
    Unique extends boolean = false,
  > = {
    readonly components: Keys;
    readonly unique?: Unique;
  };

  export namespace Index {
    /**
     * Per-index lookup handle exposed on `db.indexes.<name>`.
     *
     * Conditional intersection adds `get` only when `Unique` is exactly
     * `true`, so `db.indexes.<nonUnique>.get(...)` is a type error at the
     * call site without any runtime branch.
     */
    export type Handle<C extends Components, I extends Index<C, any, any>> =
      I extends Index<C, infer Keys, infer Unique>
        ? Keys extends readonly [StringKeyof<C>, ...StringKeyof<C>[]]
          ? {
              /** Entities whose full key tuple equals `values`. */
              find(values: Pick<C, Keys[number]>): readonly Entity[];

              /**
               * Range query over the index. Reuses the existing
               * `Filter` operator vocabulary (`==`, `!=`, `<`, `<=`,
               * `>`, `>=`) from `table/select-rows.ts` so the same
               * syntax that drives `select({ where })` describes
               * index ranges.
               *
               * Runtime contract (not encodable in the type): equality
               * on a leading prefix of the key tuple, an optional
               * range on the next key, nothing after. Calls that
               * violate this fall back to a scan.
               */
              findRange(range: Filter<Pick<C, Keys[number]>>): readonly Entity[];
            } & (Unique extends true
              ? { get(values: Pick<C, Keys[number]>): Entity | undefined }
              : {})
          : never
        : never;
  }

  export type Plugin<
    CS extends ComponentSchemas = any,
    RS extends ResourceSchemas = any,
    A extends ArchetypeComponents<StringKeyof<CS>> = any,
    TD extends TransactionDeclarations<FromSchemas<CS>, FromSchemas<RS>, any> = any,
    S extends string = any,
    AD extends ActionDeclarations<FromSchemas<CS>, FromSchemas<RS>, A, ToTransactionFunctions<TD>, S> = any,
    SVF extends ServiceFactories = any,
    CVF extends ComputedFactories = any,
    IX extends IndexDeclarations<FromSchemas<CS>> = any,
  > = {
    readonly components: CS;
    readonly resources: RS;
    readonly archetypes: A;
    readonly transactions: TD;
    readonly systems: SystemDeclarations<S>;
    readonly actions: AD;
    readonly services: SVF;
    readonly computed: CVF;
    readonly indexes: IX;
  };

  export namespace Plugin {
    export const create = createPlugin;
    export const combine = combinePlugins;
    export type ToDatabase<P extends Database.Plugin> = Database.FromPlugin<P>;
    export type ToStore<P extends Database.Plugin> = Store<FromSchemas<RemoveIndex<P['components']>>, FromSchemas<RemoveIndex<P['resources']>>, RemoveIndex<P['archetypes']>>;
    export type ToSystemDatabase<P extends Database.Plugin> = Database.FromPlugin<P> & {
      // Systems are allowed to access the database store directly.
      // This direct access will NOT trigger observable transactions.
      readonly store: Database.Plugin.ToStore<P>;
      // Systems are allowed to write to the services object directly.
      // This is dangerous and should only be done during initialization.
      services: { -readonly [K in keyof FromServiceFactories<RemoveIndex<P['services']>>]: FromServiceFactories<RemoveIndex<P['services']>>[K] };
    };
  }

}
