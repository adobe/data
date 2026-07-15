// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Archetype, ArchetypeId, FromArchetype, ReadonlyArchetype } from "../archetype/index.js";
import { ResourceComponents } from "../store/resource-components.js";
import { ReadonlyStore, Store } from "../store/index.js";
import { Entity } from "../entity/entity.js";
import { EntityReadValues } from "../store/core/index.js";
import { Observe } from "../../observe/index.js";
import { TransactionContext, TransactionResult } from "./transactional-store/index.js";
import { TransactionEnvelope } from "./reconciling/reconciling-database.js";
import { StringKeyof, RemoveIndex } from "../../types/types.js";
import { Components } from "../store/components.js";
import { ArchetypeComponents } from "../store/archetype-components.js";
import { RequiredComponents } from "../required-components.js";
import { EntitySelectOptions } from "../store/entity-select-options.js";
import { Filter } from "../../table/select-rows.js";
import { Index as StoreIndex } from "../store/index-types.js";
import type { Service } from "../../service/index.js";
import { createDatabase } from "./public/create-database.js";
import type { ConcurrencyStrategy } from "./concurrency/concurrency-strategy.js";
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
 * Plugin-level map of indexes. Re-exported from `store/index-types.ts`
 * where the canonical definition lives — same module that defines the
 * unified `Index` type (raw + computed) so a single source of truth is
 * shared between the Store layer (`store.indexes` typed handle map) and
 * the Database layer (`db.indexes`, plugin descriptor constraint).
 */
export type { IndexDeclarations } from "../store/index-types.js";
import type { IndexDeclarations } from "../store/index-types.js";

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
> extends ReadonlyStore<C, R, A, IX>, Service {
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
     * envelope was applied locally as an intermediate step (deferred-commit / sync
     * mode) or as a commit (local-only mode).
     *
     * Sync services route forwarding by `intent`:
     *   - `"commit"`       → propose to the server (reliable)
     *   - `"intermediate"` → relay to peers (lossy)
     *   - `"cancel"`       → cancel a pending intermediate step (reliable)
     */
    readonly envelopes: Observe<{
        envelope: TransactionEnvelope;
        result: TransactionResult<C> | undefined;
        intent: "commit" | "intermediate" | "cancel";
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
    /**
     * Reactive derivation. `compute` is run against a read-only projection of
     * this database ({@link Database.Read}); the derive records exactly the
     * reads it performs, subscribes to their change signals, and re-emits the
     * recomputed value whenever any of those reads could have changed. Emits
     * the initial value on subscribe; coalesces a transaction's changes into a
     * single recompute; deduplicates consecutive equal results (`options.equals`,
     * defaulting to reference equality).
     *
     * The projection omits observers, writes, and direct table/column access,
     * so a `compute` body cannot subscribe, mutate, or read raw rows — the
     * dependency set is exactly what it read, which removes the whole class of
     * "forgot to subscribe to a field I read" staleness bugs.
     *
     * Emits the initial value on subscribe, then recomputes at most once per
     * committed transaction — synchronously at the commit boundary — and
     * structurally compares the result before emitting so an unchanged value
     * never re-notifies.
     */
    derive<T>(
      compute: (db: Database.Read<Database<C, R, A, F, S, AF, SV, CV, IX>>) => T
    ): Observe<T>;
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
   * The concurrency strategy the database was created with. Sync services
   * read `concurrency.userId` to recover the peer identifier and check
   * `concurrency.deferredCommit` to confirm the database is in the
   * appropriate mode for multi-peer operation.
   */
  readonly concurrency: ConcurrencyStrategy;
  readonly system: {
    /** System create() return value, or null when create() returns void. Key is always present. */
    readonly functions: { readonly [K in S]: SystemFunction | null };
    /** Tier order for execution. Looser type allows extended dbs to be assignable to base. */
    readonly order: ReadonlyArray<ReadonlyArray<string>>;
  }
  /**
   * Serialize the database to a plain data snapshot.
   *
   * For a concurrency strategy that replays transients after serialization
   * (`onAfterToData` — i.e. `createRebaseReplayConcurrency` /
   * `createRollForwardConcurrency` / the legacy `createReconcilingDatabase`),
   * this returns a snapshot **detached** from the live store: it rolls the
   * transients back, serializes a copy of the committed state (`store.toData`
   * with `copy: true` — columns and the entity table are cloned), then replays.
   * So a database persisted with optimistic edits in flight contains only
   * committed state, and the snapshot survives the subsequent replay.
   *
   * For strategies with no replay hook (the default `createImmediateConcurrency`),
   * the faster live-reference snapshot is returned — it shares the store's
   * buffers and is only valid until the next mutation, so callers must serialize
   * it before mutating the database again.
   *
   * Historical note: the detach above fixes a bug where the live-reference
   * snapshot was corrupted by the post-serialization replay, silently leaking
   * in-flight transients into persisted state. The old reconciler tests missed
   * it because they only asserted the snapshot was truthy, never round-tripped it.
   */
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

  /**
   * The read-only projection of a Database that a `db.observe.derive` callback
   * receives. It exposes only the auto-trackable read surface —
   *   - value reads: `get`, `read`, `select`
   *   - resource reads: `resources`
   *   - index lookups: `indexes.<name>.find` / `findRange` / `get`
   *   - archetype identity: `archetypes.<name>.components` / `id`
   * — and structurally OMITS everything a derived computation must not touch:
   *   - `observe` (a derive subscribes to what it reads for you)
   *   - transactions / actions / any write
   *   - direct table access: `queryArchetypes`, `locate`, and per-archetype
   *     `columns` / `rowCount` / `insert` / row reads
   *   - `services` / `computed` / lifecycle (`extend`, `reset`, `toData`, …)
   *
   * Because the surface is narrowed structurally, misuse is a compile error
   * rather than a value that must be guarded / thrown on at runtime.
   */
  export type Read<DB extends Database<any, any, any, any, any, any, any, any, any>> =
    DB extends Database<infer C, infer R, infer A, any, any, any, any, any, infer IX>
      ? Pick<ReadonlyStore<C, R, A, IX>, "get" | "read" | "select" | "resources"> & {
          readonly indexes: {
            readonly [K in keyof IX]: Database.Index.ReadHandle<C, IX[K]>;
          };
          readonly archetypes: {
            readonly [K in keyof ReadonlyStore<C, R, A, IX>["archetypes"]]: Pick<
              ReadonlyStore<C, R, A, IX>["archetypes"][K],
              "components" | "id"
            >;
          };
        }
      : never;

  export const create = createDatabase;

  export const is = (value: unknown): value is Database => {
    return value !== null && typeof value === "object" && "transactions" in value && "actions" in value && "store" in value && "observe" in value && "system" in value && "extend" in value;
  }

  export const observeSelectDeep = _observeSelectDeep;

  // The user-facing `Database.Index` namespace re-exports the canonical
  // declaration and handle types from `store/index-types.ts`. Defining
  // them there keeps the `Store` interface able to type `store.indexes`
  // (a lower-layer concern) without an import cycle into this module.
  // See `Index` and `Index.Handle` in `store/index-types.ts`.
  export type Index<
    C extends Components = any,
  > = StoreIndex<C, any, any, any>;

  export namespace Index {
    export type Handle<C extends Components, I extends StoreIndex<C, any, any, any>> =
      StoreIndex.Handle<C, I>;
    /**
     * The index handle as exposed to a `db.observe.derive` callback: the
     * synchronous lookups (`find` / `findRange` / `get`) only. `observe` is
     * removed — a derive subscribes to the reads it performs automatically, so
     * calling `observe` from inside one is a category error.
     */
    export type ReadHandle<C extends Components, I extends StoreIndex<C, any, any, any>> =
      Omit<Handle<C, I>, "observe">;
  }

  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace Archetype {
    /**
     * The row (component) type of the archetype named `K` on a store /
     * database / service type `S`. Lets callers *name* an archetype row
     * without re-spelling its columns — derive instead of re-declare.
     *
     * ```ts
     * type MainService = Database.Plugin.ToDatabase<typeof mainPlugin>;
     * type Track = Database.Archetype.RowOf<MainService, "Track">;
     * const t: ReadonlyArchetype<Track> = db.archetypes.Track; // no cast
     * ```
     */
    export type RowOf<
      S extends { readonly archetypes: Record<string, unknown> },
      K extends StringKeyof<S["archetypes"]>,
    > = FromArchetype<S["archetypes"][K]>;
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
    /**
     * The plugin's store as seen *inside a transaction body* — i.e. `ToStore<P>`
     * plus the `userId` field added by the transaction dispatcher. Use this
     * when typing helper functions that forward a transaction's store into
     * another plugin's transaction declaration; `ToStore<P>` is the bare
     * store type and does not include `userId`.
     */
    export type ToTransactionContext<P extends Database.Plugin> = TransactionContext<FromSchemas<RemoveIndex<P['components']>>, FromSchemas<RemoveIndex<P['resources']>>, RemoveIndex<P['archetypes']>>;
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
