// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../types/types.js";
import type { Entity } from "../entity/entity.js";
import { Components } from "./components.js";

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
 * Per-slot extractor in a compound `key` declaration. Either:
 * - a `StringKeyof<C>` — read the value of that column directly, or
 * - a function — derive the slot's value from the index's read components.
 */
export type IndexKeySlot<C extends Components> =
    | StringKeyof<C>
    | ((...args: any[]) => unknown);

/**
 * The four shapes a `key` declaration can take. Drives the `find` / `get`
 * argument type via {@link FindArg}.
 *
 *  - `string` — read this one column. `find` takes a scalar.
 *  - `readonly string[]` — read each of these columns. `find` takes
 *    `{ col1: ..., col2: ... }` keyed by the column names themselves.
 *  - `(...args) => Value` — derive the bucket key from the components.
 *    `find` takes whatever the function returns (or its element type
 *    when the return is an array — multi-value fan-out).
 *  - slot map — name each part of a compound key; values are either
 *    column-name strings (identity) or extractor functions. `find`
 *    takes an object keyed by the slot names.
 */
export type IndexKey<C extends Components> =
    | StringKeyof<C>
    | readonly StringKeyof<C>[]
    | ((...args: any[]) => unknown)
    | { readonly [slot: string]: IndexKeySlot<C> };

/**
 * Within-bucket ordering. `by` declares the columns to read into the
 * per-entity sort cache; `compare` (optional) is the comparator over
 * `Pick<C, by[number]>`. When `compare` is omitted, the default is
 * ascending across `by` from left to right with positional tie-break
 * (`JS <` / `>` per column).
 *
 * `compare` is method shorthand for the same `IX & XIX` variance reason
 * that `compute` was previously: `Store.extend`'s result intersects index
 * declarations, which would otherwise trip `strictFunctionTypes` over
 * contravariant parameter positions.
 */
export type IndexOrder<
    C extends Components,
    By extends readonly StringKeyof<C>[] = readonly StringKeyof<C>[],
> = {
    readonly by: By;
    compare?(a: Pick<C, By[number]>, b: Pick<C, By[number]>): number;
};

/**
 * Type-level declaration of an index.
 *
 * - `key` is the only required field. Its shape drives the bucket layout
 *   and the lookup argument type of `find` / `get` / `findRange`.
 * - `order` (optional) maintains sorted iteration within each bucket.
 * - `unique` (optional) — when true, at most one entity may hold each
 *   bucket key; `get(arg)` is exposed and returns `Entity | null`.
 * - `components` (optional) — names the columns extractor functions
 *   read. Only needed when at least one function reads a column not
 *   implied by a string-identity key entry.
 *
 * See `packages/data/src/ecs/README.md` for the full pattern catalogue.
 */
export type Index<
    C extends Components = any,
    K extends IndexKey<C> = IndexKey<C>,
    O extends IndexOrder<C, any> | undefined = IndexOrder<C, any> | undefined,
    U extends boolean = boolean,
> = {
    readonly key: K;
    readonly order?: O;
    readonly unique?: U;
    readonly components?: readonly StringKeyof<C>[];
};

/**
 * Resolve a slot's contributed `find` field type. Strings are identity
 * reads on the named column; functions yield their return type (element
 * type if the return is an array).
 */
type SlotFindType<C extends Components, V> =
    V extends StringKeyof<C>
        ? ElementOf<C[V]>
        : V extends (...args: any[]) => infer R
            ? ElementOf<R>
            : never;

/** Argument type of `find` / `get` derived from the `key` shape. */
type FindArg<C extends Components, K> =
    K extends StringKeyof<C> ? ElementOf<C[K]>
    : K extends readonly StringKeyof<C>[]
        ? { readonly [P in K[number]]: ElementOf<C[P]> }
    : K extends (...args: any[]) => infer R ? ElementOf<R>
    : K extends Record<string, IndexKeySlot<C>>
        ? { readonly [Slot in keyof K]: SlotFindType<C, K[Slot]> }
    : never;

/** Comparison-operator filter on a scalar bucket-key value. */
type OperatorFilter<T> = {
    readonly "=="?: T;
    readonly "!="?: T;
    readonly "<"?: T;
    readonly "<="?: T;
    readonly ">"?: T;
    readonly ">="?: T;
};

/**
 * `findRange` argument: each field of the find argument may be either an
 * equality value or a `<,<=,>,>=,==,!=` operator filter. For scalar keys
 * the entire argument may itself be an operator filter.
 */
type RangeArg<T> =
    T extends object
        ? { readonly [P in keyof T]?: T[P] | OperatorFilter<T[P]> }
        : T | OperatorFilter<T>;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Index {
    /** Public lookup handle exposed on `db.indexes.<name>` and `t.indexes.<name>`. */
    export type Handle<C extends Components, I extends Index<C, any, any, any>> =
        I extends Index<C, infer K, any, infer U>
            ? {
                find(arg: FindArg<C, K>): readonly Entity[];
                findRange(arg: RangeArg<FindArg<C, K>>): readonly Entity[];
            } & (U extends true
                ? { get(arg: FindArg<C, K>): Entity | null }
                : {})
            : never;
}

/**
 * Plugin-level / store-level map of indexes. Keys are user-chosen index
 * names; values are `Index` declarations whose `key` references real
 * columns of `C`.
 *
 * The structural shape is inlined (rather than `Index<C, any, any, any>`) so
 * that the per-entry `key`/`order` fields are actually constrained at the
 * declaration site. With `Index<C, any, any, any>` the wildcard `any`
 * generics widen `key` past `IndexKey<C>`, so a typo like `{ key: "bogus" }`
 * silently passes the constraint. Inlining `key: IndexKey<C>` here makes
 * the typo a type error at the plugin descriptor.
 */
export type IndexDeclarations<C extends Components = any> = {
    readonly [name: string]: {
        readonly key: IndexKey<C>;
        readonly order?: IndexOrder<C>;
        readonly unique?: boolean;
        readonly components?: readonly StringKeyof<C>[];
    };
};
