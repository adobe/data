// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../types/types.js";
import { Filter, WhereCondition } from "../../table/select-rows.js";
import type { Entity } from "../entity/entity.js";
import { Components } from "./components.js";

/**
 * Maps a tuple of component names to the corresponding tuple of component
 * value types, preserving order. Used as the rest-arg type of an index's
 * optional `compute` function so the function signature matches the
 * `components` tuple positionally.
 *
 * `-readonly` strips the readonly modifier so the result is suitable for
 * use as a function rest-parameter type.
 */
type IndexedValues<C extends Components, Keys extends readonly StringKeyof<C>[]> = {
    -readonly [I in keyof Keys]: C[Extract<Keys[I], StringKeyof<C>>];
};

/**
 * If `T` is an array type, the element type; otherwise `T` unchanged.
 *
 * Multi-value indexes auto-fan-out array values into per-element bucket
 * entries at insert time. The lookup methods therefore take the element
 * type, not the array — a query like `find("joe")` against a
 * `Task { assigned: string[] }` is exactly what users want, and an array
 * as a single opaque key is virtually never useful (order-dependent, not
 * a natural query shape).
 */
type ElementOf<T> = T extends readonly (infer E)[] ? E : T;

/**
 * Type-level declaration of an index over one or more components.
 *
 * Two flavours share this single type, distinguished by the presence of
 * the optional `compute` function:
 *
 * - **Raw** (no `compute`): the lookup key is the component tuple itself.
 *   `Key` defaults to `Pick<C, Keys[number]>`. Handle methods take a
 *   component-keyed object — V1 behaviour, unchanged.
 * - **Computed** (with `compute`): the lookup key is whatever `compute`
 *   returns. `Key` is inferred from the function's return type. Handle
 *   methods take that derived key directly.
 *
 * `compute` MUST be pure — same inputs always produce the same output,
 * no side effects, no dependence on state outside the arguments. The
 * registry caches the derived key at insert/update and re-derives on
 * every `update`; impurity corrupts the index. Not runtime-checked.
 *
 * - Every key in `components` is statically checked against `C`.
 * - When `compute` is supplied, its arg list is type-checked against
 *   the component value types, in `components` order.
 *
 * Defined here (lowest layer) rather than in `database/database.ts` so the
 * `Store` interface can reference `Handle` for its `indexes` field without
 * causing a `store → database` import cycle. The `Database.Index`
 * namespace in `database/database.ts` re-exports these types as the
 * user-facing API.
 */
export type Index<
    C extends Components = any,
    Keys extends readonly [StringKeyof<C>, ...StringKeyof<C>[]] = any,
    Key = Pick<C, Keys[number] & StringKeyof<C>>,
    Unique extends boolean = false,
> = {
    readonly components: Keys;
    /**
     * Method shorthand (rather than a function-property arrow) so the
     * parameter types are bivariant under intersection. Required because
     * `Store.extend`'s result intersects `IX & XIX`, which would otherwise
     * trip `strictFunctionTypes` over `compute`'s contravariant parameter
     * positions. Inference (Key from the return type, arg types from
     * `IndexedValues<C, Keys>`) still works as expected.
     */
    compute?(...args: IndexedValues<C, Keys>): Key;
    readonly unique?: Unique;
    /**
     * Optional sort order maintained *within* each bucket. Keys reference
     * component names on the indexed entity (not necessarily the same as
     * `components`); values are `true` for ascending or `false` for
     * descending. Object insertion order defines precedence — the first
     * key is the primary sort, subsequent keys break ties.
     *
     * Same vocabulary as `db.select(include, { order })`. When omitted,
     * bucket contents follow insertion order (V1 behavior).
     *
     * Performance: a comparator is bound once at index creation —
     * single-key declarations get a specialized closure with no per-op
     * overhead vs. an `order`-less index. Multi-key indexes only pay the
     * iteration cost in the comparator they declared.
     *
     * Not supported alongside `compute` in V1: `compute` produces a
     * derived key while `order` sorts by raw entity components — the
     * two views don't compose cleanly. Declaring both throws at
     * registration time.
     */
    readonly order?: { readonly [K in StringKeyof<C>]?: boolean };
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Index {
    /**
     * True when `I`'s declaration has a `compute` function. Used to choose
     * between `RawHandle` and `ComputedHandle` shapes.
     */
    type IsComputed<I> = I extends { compute: (...args: any) => any } ? true : false;

    /**
     * Per-component lookup key shape. Each indexed component contributes
     * its scalar value, or — for array-typed components — a single
     * element of the array. The runtime auto-fans-out arrays at insert
     * time so a `find` against a `Task { assigned: string[] }` takes
     * `{ assigned: string }`, not `{ assigned: string[] }`.
     */
    type RawLookupKey<C extends Components, Keys extends readonly StringKeyof<C>[]> = {
        [K in Keys[number]]: ElementOf<C[K]>;
    };

    /**
     * Raw-index handle: lookup methods take the per-component lookup
     * key shape (`RawLookupKey`). Array-typed components contribute
     * their element type — multi-value indexes are transparent to the
     * lookup signature.
     */
    type RawHandle<
        C extends Components,
        Keys extends readonly [StringKeyof<C>, ...StringKeyof<C>[]],
        Unique extends boolean,
    > = {
        /** Entities whose key tuple equals `values` (element form for array components). */
        find(values: RawLookupKey<C, Keys>): readonly Entity[];

        /**
         * Range query over the index. Reuses the existing `Filter`
         * operator vocabulary (`==`, `!=`, `<`, `<=`, `>`, `>=`) from
         * `table/select-rows.ts` so the same syntax that drives
         * `select({ where })` describes index ranges. Per-component
         * shape follows `RawLookupKey` — array components are queried
         * by their element type.
         */
        findRange(range: Filter<RawLookupKey<C, Keys>>): readonly Entity[];
    } & (Unique extends true
        ? { get(values: RawLookupKey<C, Keys>): Entity | undefined }
        : {});

    /**
     * Computed-index handle: lookup methods take the derived key value
     * directly. When `compute` returns an array, the index auto-fans-out
     * each element into its own bucket entry and the lookup methods take
     * the element type (via `ElementOf<Key>`). `findRange` accepts a
     * single-scalar `WhereCondition` — direct value or comparison
     * operators — matching the vocabulary `Filter` already uses
     * per-column.
     */
    type ComputedHandle<Key, Unique extends boolean> = {
        find(key: ElementOf<Key>): readonly Entity[];
        findRange(range: WhereCondition<ElementOf<Key>>): readonly Entity[];
    } & (Unique extends true
        ? { get(key: ElementOf<Key>): Entity | undefined }
        : {});

    /**
     * Per-index lookup handle exposed on `db.indexes.<name>` and on
     * `t.indexes.<name>` (inside transactions).
     *
     * Dispatches on the declaration's `compute` presence:
     * - present → `ComputedHandle<Key, Unique>` (Key inferred from compute)
     * - absent  → `RawHandle<C, Keys, Unique>`  (raw component-tuple lookup)
     *
     * In both branches the conditional intersection adds `get` only when
     * `Unique extends true`, so `indexes.<nonUnique>.get(...)` is a type
     * error at the call site without any runtime branch.
     */
    export type Handle<C extends Components, I extends Index<C, any, any, any>> =
        I extends Index<C, infer Keys, infer Key, infer Unique>
            ? Keys extends readonly [StringKeyof<C>, ...StringKeyof<C>[]]
                ? IsComputed<I> extends true
                    ? ComputedHandle<Key, Unique>
                    : RawHandle<C, Keys, Unique>
                : never
            : never;
}

/**
 * Plugin-level / store-level map of indexes. Keys are user-chosen index
 * names; values are `Index` declarations whose `components` tuple must
 * reference real keys of `C`. The constraint is shaped to allow
 * `RemoveIndex<...>` to strip the index signature and recover the literal
 * map at the call site (same pattern as `ArchetypeComponents`).
 */
export type IndexDeclarations<C extends Components = any> = {
    readonly [name: string]: Index<C, readonly [StringKeyof<C>, ...StringKeyof<C>[]], any, boolean>;
};
