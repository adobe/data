// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../types/types.js";
import type { Entity } from "../entity/entity.js";
import type { Observe } from "../../observe/index.js";
import { Components } from "./components.js";

/**
 * If `T` is an array type, the element type; otherwise `T` unchanged.
 *
 * Multi-value indexes auto-fan-out array values into per-element bucket
 * entries at insert time. The lookup field therefore takes the element
 * type, not the array — a query like `find({ assigned: "joe" })` against a
 * `Task { assigned: string[] }` is exactly what users want, and an array
 * as a single opaque key is virtually never useful (order-dependent, not
 * a natural query shape).
 */
type ElementOf<T> = T extends readonly (infer E)[] ? E : T;

/**
 * Per-slot extractor in a compound `key` declaration. Either:
 * - a `StringKeyof<C>` — read the value of that column directly, or
 * - a function — derive the slot's value from a single **named object** of the
 *   component values, read by name (e.g. `(c) => c.email!.toLowerCase()`), not
 *   from positional arguments.
 *
 * The argument is typed `Partial<C>`: at runtime only the index's declared
 * `components` are populated, and the type marks every field optional rather
 * than unsafely implying all of `C` is present — so the extractor acknowledges
 * possible absence (use `!` / `?.` on the components you declared).
 */
export type IndexKeySlot<C extends Components> =
    | StringKeyof<C>
    | ((components: Partial<C>) => unknown);

/**
 * The three shapes a `key` declaration can take. Every shape resolves to a
 * **named object** lookup argument via {@link FindArg} — there is no scalar
 * form, so `find` / `get` / `observe` are uniform across all indexes.
 *
 *  - `string` — read this one column. Sugar for the single-element tuple
 *    `[col]`; `find` takes `{ col: value }` (not a bare scalar).
 *  - `readonly string[]` — read each of these columns. `find` takes
 *    `{ col1: ..., col2: ... }` keyed by the column names themselves.
 *  - slot map — name each part of a compound key; values are either
 *    column-name strings (identity) or extractor functions. `find` takes an
 *    object keyed by the slot names. A computed key is a single-slot map,
 *    e.g. `{ emailLower: (email) => email.toLowerCase() }`, so the derived
 *    value is still addressed by name.
 *
 * (There is intentionally no bare `(...args) => Value` form: a computed value
 * needs a name to appear in the lookup object, so wrap it in a slot map.)
 */
export type IndexKey<C extends Components> =
    | StringKeyof<C>
    | readonly StringKeyof<C>[]
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

/**
 * Argument type of `find` / `get` / `observe`, derived from the `key` shape.
 * Always a named object: a single-column key yields `{ col: value }`, a tuple
 * yields one field per column, and a slot map yields one field per slot.
 */
type FindArg<C extends Components, K> =
    K extends StringKeyof<C>
        ? { readonly [P in K]: ElementOf<C[P]> }
    : K extends readonly StringKeyof<C>[]
        ? { readonly [P in K[number]]: ElementOf<C[P]> }
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
                /**
                 * Reactive view of `find(arg)`. Emits the current sorted
                 * bucket synchronously on subscribe, then again — on a
                 * microtask after a committed transaction — whenever the
                 * observed bucket's membership *or order* changes. Unlike
                 * pairing `observe.select` with `find`, a sort-key-only
                 * reorder is never silently swallowed.
                 */
                observe(arg: FindArg<C, K>): Observe<readonly Entity[]>;
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
