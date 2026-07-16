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
import { Index as StoreIndex, IndexKey } from "../store/index-types.js";
import type { Service } from "../../service/index.js";
import { createDatabase } from "./public/create-database.js";
import type { ConcurrencyStrategy } from "./concurrency/concurrency-strategy.js";
import { observeSelectDeep as _observeSelectDeep } from "./public/observe-select-deep.js";
import { ResourceSchemas } from "../resource-schemas.js";
import { ComponentSchemas } from "../component-schemas.js";
import { PartitionKeysOf } from "../store/partition.js";
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
  PK extends string = never,
> extends ReadonlyStore<C, R, A, IX, PK>, Service {
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
  }
  /**
   * Reactive derivation. `compute` runs against a read-only projection of this
   * database ({@link Database.Read} — value / index / resource reads only; no
   * observers, writes, or table access). The derive records exactly the reads
   * it performs and re-emits when any could have changed: the initial value on
   * subscribe, then at most once per committed transaction (synchronously at
   * the commit boundary), structurally deduplicated so an unchanged result
   * never re-notifies.
   *
   * The callback receives `Database.Read<this>`, so an *intersection* database
   * resolves to the merged read surface — consumers never need to cast.
   */
  derive<T>(compute: (db: Database.Read<this>) => T): Observe<T>;
  /**
   * `derive` with a fixed record of external `inputs` — arbitrary `Observe<T>`
   * values that do NOT live in the ECS (e.g. observables exposed by services).
   * Their CURRENT values are injected as the second callback argument, keyed the
   * same as `inputs` and unwrapped (`Observe<U> → U`); the first argument stays
   * the read projection, so a body can fold external values and ECS reads into
   * one synchronous expression.
   *
   * The inputs are subscribed once, at the root (not read dynamically inside the
   * body), so the set is fixed for the life of the derive. The derive recomputes
   * when any input emits OR an ECS read it recorded could have changed; like
   * {@link Observe.fromProperties}, the first value is withheld until every input
   * has produced one. Anything dynamic — an input set that depends on data, or
   * an input whose arguments come from an ECS read — composes with
   * {@link Observe.withSwitch} / {@link Observe.fromKeys} around the derive.
   */
  derive<I extends Record<string, Observe<unknown>>, T>(
    inputs: I,
    compute: (
      db: Database.Read<this>,
      inputs: { readonly [K in keyof I]: I[K] extends Observe<infer U> ? U : never },
    ) => T,
  ): Observe<T>;
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
    RemoveIndex<P['indexes']>,
    PartitionKeysOf<RemoveIndex<P['components']>>
  >;

  /**
   * The read-only projection of a Database that a `db.derive` callback
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
  // Defined structurally (mapping over `DB`'s own members) rather than via
  // `DB extends Database<infer C, …>`. The `infer` form collapses an
  // *intersection* database `A & B` to whichever single member the conditional
  // matches, losing the other's surface. Mapping over the members directly lets
  // `Read<A & B>` distribute over the intersection and merge both read surfaces —
  // so a `db.derive` on an intersection receiver (see the top-level `derive`
  // signature, which passes `Database.Read<this>`) sees the combined
  // indexes + resources + archetypes, and consumers never need to cast.
  export type Read<DB extends Database<any, any, any, any, any, any, any, any, any, any>> =
    Pick<DB, "get" | "read" | "resources"> & {
      // Presence `select` only — `include` (+ `exclude`), no `where` / `order`.
      // Membership queries are reactively precise (they change only on archetype
      // migration); the value-dependent `where` / `order` options can be tracked
      // only coarsely (any write to a filtered/sorted column re-runs the whole
      // derive), so they are deliberately absent — a value-keyed or ordered
      // reactive read must go through a declared index (`indexes.<name>.find` /
      // `findRange`), which is precise and O(bucket). Typed loosely over entity
      // names because the structural `Read` (needed for the intersection merge
      // above) does not recover `DB`'s component map; the result is entities, so
      // no value typing is lost.
      select(
        include: readonly string[] | ReadonlySet<string>,
        options?: { readonly exclude?: readonly string[] },
      ): readonly Entity[];
      readonly indexes: {
        readonly [K in keyof DB["indexes"]]: Omit<DB["indexes"][K], "observe">;
      };
      readonly archetypes: {
        readonly [K in keyof DB["archetypes"]]: Pick<DB["archetypes"][K], ("components" | "id") & keyof DB["archetypes"][K]>;
      };
    };

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
  //
  // `K` is defaulted to `IndexKey<C>` (not erased to `any`) so that a bare
  // `Database.Index<C>` still constrains `key` to real columns of `C`. This
  // makes it usable as a `satisfies` target on a standalone index literal —
  // `{ key: "bogus" } satisfies Database.Index<C>` is a compile error — while
  // `O`/`U` stay wide since `order`/`unique` are optional and self-describing.
  export type Index<
    C extends Components = any,
    K extends IndexKey<C> = IndexKey<C>,
  > = StoreIndex<C, K, any, any>;

  export namespace Index {
    export type Handle<C extends Components, I extends StoreIndex<C, any, any, any>> =
      StoreIndex.Handle<C, I>;
    /**
     * The index handle as exposed to a `db.derive` callback: the
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
    export type ToTransactionContext<P extends Database.Plugin> = TransactionContext<FromSchemas<RemoveIndex<P['components']>>, FromSchemas<RemoveIndex<P['resources']>>, RemoveIndex<P['archetypes']>, RemoveIndex<P['indexes']>, PartitionKeysOf<RemoveIndex<P['components']>>>;
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
