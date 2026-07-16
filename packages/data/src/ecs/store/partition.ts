// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../types/types.js";
import { ComponentSchemas } from "../component-schemas.js";
import { RequiredComponents } from "../required-components.js";
import { Archetype } from "../archetype/archetype.js";

/**
 * The component keys of a schema map that are declared `partition: true`.
 *
 * Detection is at the *schema* level, where the marker survives — the resolved
 * component value map (`FromSchemas<CS>`) has already dropped it. Requires the
 * schema literal to be `as const` so `partition` is the literal `true`, not
 * `boolean` (the project's `... as const satisfies Schema` idiom guarantees it).
 */
export type PartitionKeysOf<CS extends ComponentSchemas> = {
    [K in StringKeyof<CS>]: CS[K] extends { partition: true } ? K : never;
}[StringKeyof<CS>];

/**
 * Whether a component-key set intersects the store's partition keys.
 *
 * The `[PK] extends [never]` guard is load-bearing: when a store declares no
 * partition components (`PK = never` — the default everywhere), this collapses
 * to `false` *without* inspecting `Keys`. That matters because `Keys` is often a
 * generic indexed access (`A[K][number]` inside a `TransactionContext<C,R,A>`);
 * `Extract<GenericKeys, never>` would otherwise stay a *deferred* conditional,
 * leaving `store.archetypes.<K>` as the unresolved union `Archetype.Router | Archetype`
 * and breaking assignability in every generic store context. Short-circuiting
 * on `PK` keeps non-partition stores paying nothing and resolving eagerly.
 */
// True when T is `any`. Uses the distribution behaviour of `any` (an `any`
// checked type makes a conditional resolve to both branches → `boolean`), which
// — unlike the `0 extends (1 & T)` idiom — still fires when T is a type
// parameter constrained to `string` (as `PK` is here) instantiated with `any`.
type IsAny<T> = boolean extends (T extends never ? true : false) ? true : false;

export type HasPartitionKey<Keys extends string, PK extends string> =
    [PK] extends [never] ? false
    // PK is `any` (e.g. a universal `Database<…, any>` constraint like
    // `Database.Read`): the archetype could be either concrete or a Router, so
    // yield `boolean` — {@link ArchetypeOrRouter} then distributes to the union
    // `Archetype.Router | Concrete`, a supertype every real store satisfies.
    : IsAny<PK> extends true ? boolean
    : [Extract<Keys, PK>] extends [never] ? false : true;

/**
 * The `store.archetypes.<Name>` handle for one declared archetype: a
 * {@link Archetype.Router} when it includes a partition component, else the
 * `Concrete` archetype type (`Archetype` or `ReadonlyArchetype`, supplied by the
 * caller). `Has` is a *naked* type parameter so a `boolean` (from `PK = any`)
 * distributes to `Archetype.Router<C> | Concrete`.
 */
export type ArchetypeOrRouter<Has extends boolean, C extends RequiredComponents, Concrete> =
    Has extends true ? Archetype.Router<C> : Concrete;

/**
 * Return type of `ensureArchetype(keys, values?)`:
 *  - a value is supplied → a concrete {@link Archetype} (the resolved member),
 *    regardless of partitioning — this is the same-value fast path;
 *  - else the key set includes a partition component → a {@link Archetype.Router} that
 *    routes each `insert` by the row's partition value;
 *  - else → a concrete {@link Archetype} (today's behavior, unchanged).
 *
 * When `Keys` is not statically known to include or exclude a partition
 * component, `HasPartitionKey` stays a union and the result widens to
 * `Archetype<C> | Archetype.Router<C>` — which still exposes `.insert` (both branches
 * share it); only dense column access requires narrowing to `Archetype`.
 */
export type EnsureArchetypeResult<
    C extends RequiredComponents,
    Keys extends string,
    PK extends string,
    ValueProvided extends boolean,
> = ValueProvided extends true
    ? Archetype<C>
    : HasPartitionKey<Keys, PK> extends true
        ? Archetype.Router<C>
        : Archetype<C>;

/**
 * Type of `store.archetypes.<Name>`: a {@link Archetype.Router} when the declared archetype
 * includes a partition component, else a concrete {@link Archetype}. The keys are
 * statically known here (from the schema's `archetypes` map), so this never
 * widens to a union — the discrimination is exact per declared name.
 */
export type StoreArchetypeHandle<
    C extends RequiredComponents,
    Keys extends string,
    PK extends string,
> = HasPartitionKey<Keys, PK> extends true ? Archetype.Router<C> : Archetype<C>;
