// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../types/types.js";
import { ComponentSchemas } from "../component-schemas.js";
import { RequiredComponents } from "../required-components.js";
import { Archetype, Router } from "../archetype/archetype.js";

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
 * leaving `store.archetypes.<K>` as the unresolved union `Router | Archetype`
 * and breaking assignability in every generic store context. Short-circuiting
 * on `PK` keeps non-partition stores paying nothing and resolving eagerly.
 */
export type HasPartitionKey<Keys extends string, PK extends string> =
    [PK] extends [never] ? false
    : [Extract<Keys, PK>] extends [never] ? false : true;

/**
 * Return type of `ensureArchetype(keys, values?)`:
 *  - a value is supplied → a concrete {@link Archetype} (the resolved member),
 *    regardless of partitioning — this is the same-value fast path;
 *  - else the key set includes a partition component → a {@link Router} that
 *    routes each `insert` by the row's partition value;
 *  - else → a concrete {@link Archetype} (today's behavior, unchanged).
 *
 * When `Keys` is not statically known to include or exclude a partition
 * component, `HasPartitionKey` stays a union and the result widens to
 * `Archetype<C> | Router<C>` — which still exposes `.insert` (both branches
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
        ? Router<C>
        : Archetype<C>;

/**
 * Type of `store.archetypes.<Name>`: a {@link Router} when the declared archetype
 * includes a partition component, else a concrete {@link Archetype}. The keys are
 * statically known here (from the schema's `archetypes` map), so this never
 * widens to a union — the discrimination is exact per declared name.
 */
export type StoreArchetypeHandle<
    C extends RequiredComponents,
    Keys extends string,
    PK extends string,
> = HasPartitionKey<Keys, PK> extends true ? Router<C> : Archetype<C>;
