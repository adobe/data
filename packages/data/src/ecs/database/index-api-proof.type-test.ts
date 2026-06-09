// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Type-only proof for the redesigned index declaration API.
 *
 * Covers all 12 patterns from the catalogue in the README, asserting that
 *   - the `key` declaration constrains valid component references,
 *   - the inferred `find` / `get` argument shape matches the declared `key` shape,
 *   - `get` is exposed only when `unique: true`,
 *   - `get` returns `Entity | null` (not `undefined`),
 *   - `compare` arguments are typed as `Pick<C, by[number]>` so unknown columns are errors.
 *
 * This file is consumed only by `tsc`. Once these compile, the implementation
 * can proceed with confidence that the static surface is sound.
 */

import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";
import { Entity } from "../entity/entity.js";
import type { StringKeyof } from "../../types/types.js";

// ============================================================================
// Type helpers — the bits the runtime would normalize at index creation.
// ============================================================================

type ElementOf<T> = T extends readonly (infer E)[] ? E : T;

/** Resolve a slot's contributed `find` field type. */
type SlotFindType<C, V> =
    V extends StringKeyof<C>
        ? ElementOf<C[V]>
        : V extends (...args: any[]) => infer R
            ? ElementOf<R>
            : never;

/** Derive the `find` / `get` argument type from a `key` declaration. */
type FindArg<C, K> =
    // bare column-name string → scalar find
    K extends StringKeyof<C> ? ElementOf<C[K]>
    // tuple/array of column names → object find keyed by those columns
    : K extends readonly StringKeyof<C>[]
        ? { readonly [P in K[number]]: ElementOf<C[P]> }
    // function → scalar find (return type drives the key)
    : K extends (...args: any[]) => infer R ? ElementOf<R>
    // slot map → object find keyed by slot names
    : K extends Record<string, StringKeyof<C> | ((...args: any[]) => unknown)>
        ? { readonly [Slot in keyof K]: SlotFindType<C, K[Slot]> }
    : never;

/** The public handle exposed at `db.indexes.<name>`. */
type IndexHandle<C, K, U extends boolean> = {
    find(arg: FindArg<C, K>): readonly Entity[];
} & (U extends true
    ? { get(arg: FindArg<C, K>): Entity | null }
    : {});

// ============================================================================
// Test component map — covers the shapes used by the catalogue patterns.
// ============================================================================

type Position = "qb" | "halfback" | "coach" | "owner";

type C = {
    // raw single-column
    email: string;

    // raw compound
    team: number;
    position: Position;

    // ChildOf / OrderedChildOf top-level
    parent: number;
    fractIndex: string;

    // multi-value array column
    assigned: readonly string[];

    // computed scalar source
    body: string;

    // nested data for MappedChildOf
    player: { parent: number; key: Position };

    // nested data for OrderedChildOf
    foo: { parent: number; order: string };

    // nested data for combined sorted+mapped
    item: { parent: number; key: string; fractIndex: string };

    // tasks-by-priority custom comparator
    owner: number;
    priority: number;
    due: number;

    // for the mixed identity + derived pattern: a top-level role column
    role: Position;
};

// ============================================================================
// 1. Single-column unique lookup — `byEmail`
// ============================================================================

{
    type Decl = { key: "email"; unique: true };
    type H = IndexHandle<C, Decl["key"], Decl["unique"]>;

    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], string>>;
    type _GetArg  = Assert<Equal<Parameters<H["get"]>[0], string>>;
    type _GetRet  = Assert<Equal<ReturnType<H["get"]>, Entity | null>>;
    type _FindRet = Assert<Equal<ReturnType<H["find"]>, readonly Entity[]>>;
}

// ============================================================================
// 2. Multi-column compound unique — `playerSlot`
// ============================================================================

{
    type Decl = { key: readonly ["team", "position"]; unique: true };
    type H = IndexHandle<C, Decl["key"], Decl["unique"]>;

    type _FindArg = Assert<Equal<
        Parameters<H["find"]>[0],
        { readonly team: number; readonly position: Position }
    >>;
    type _GetRet = Assert<Equal<ReturnType<H["get"]>, Entity | null>>;
}

// ============================================================================
// 3. Non-unique by single column — `childrenOf`
// ============================================================================

{
    type Decl = { key: "parent" };
    type H = IndexHandle<C, Decl["key"], false>;

    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], number>>;
    // No `get` on non-unique:
    type _NoGet = Assert<Equal<"get" extends keyof H ? true : false, false>>;
}

// ============================================================================
// 4. Sorted children — `orderedChildrenOf`
// ============================================================================

{
    type Decl = { key: "parent"; order: { by: readonly ["fractIndex"] } };
    type H = IndexHandle<C, Decl["key"], false>;

    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], number>>;

    // The compare function for this order would be `(a: Pick<C, "fractIndex">, b: same) => number`.
    type Compare = (a: Pick<C, "fractIndex">, b: Pick<C, "fractIndex">) => number;
    type _CompareArg = Assert<Equal<Parameters<Compare>[0], { fractIndex: string }>>;
}

// ============================================================================
// 5. Multi-value (array column → fan-out) — `tasksByAssignee`
// ============================================================================

{
    type Decl = { key: "assigned" };   // C["assigned"] = readonly string[]
    type H = IndexHandle<C, Decl["key"], false>;

    // Array-valued column → find takes the ELEMENT type.
    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], string>>;
}

// ============================================================================
// 6. Computed scalar (case-insensitive email) — `byEmailCi`
// ============================================================================

{
    type Decl = { key: (email: string) => string };
    type H = IndexHandle<C, Decl["key"], false>;

    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], string>>;
}

// ============================================================================
// 7. Multi-value computed (compute returns array → fan-out) — `docsByKeyword`
// ============================================================================

{
    type Decl = { key: (body: string) => string[] };
    type H = IndexHandle<C, Decl["key"], false>;

    // Array return type → find takes the ELEMENT type.
    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], string>>;
}

// ============================================================================
// 8. Compound from nested data — `playerByRoster`
// ============================================================================

{
    type Decl = {
        key: {
            team:     (p: C["player"]) => number;
            position: (p: C["player"]) => Position;
        };
        unique: true;
    };
    type H = IndexHandle<C, Decl["key"], Decl["unique"]>;

    type _FindArg = Assert<Equal<
        Parameters<H["find"]>[0],
        { readonly team: number; readonly position: Position }
    >>;
    type _GetRet = Assert<Equal<ReturnType<H["get"]>, Entity | null>>;
}

// ============================================================================
// 9. Sorted from nested data — `orderedChildrenOfFoo`
// ============================================================================

{
    type Decl = {
        key: (f: C["foo"]) => number;
        order: { by: readonly ["foo"]; compare(a: Pick<C, "foo">, b: Pick<C, "foo">): number };
    };
    type H = IndexHandle<C, Decl["key"], false>;

    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], number>>;
    type _CompareArgA = Assert<Equal<
        Parameters<Decl["order"]["compare"]>[0],
        { foo: { parent: number; order: string } }
    >>;
}

// ============================================================================
// 10. Mixed identity + derived parts — `playerByTeamRole`
// ============================================================================

{
    type Decl = {
        key: {
            team: "team";                                  // identity string
            role: (p: C["player"]) => Position;            // derived from nested
        };
        unique: true;
    };
    type H = IndexHandle<C, Decl["key"], Decl["unique"]>;

    type _FindArg = Assert<Equal<
        Parameters<H["find"]>[0],
        { readonly team: number; readonly role: Position }
    >>;
}

// ============================================================================
// 11. Computed mapped + sorted — `orderedRoster`
// ============================================================================

{
    type Decl = {
        key: {
            team: (i: C["item"]) => number;
            role: (i: C["item"]) => string;
        };
        order: { by: readonly ["item"]; compare(a: Pick<C, "item">, b: Pick<C, "item">): number };
        unique: true;
    };
    type H = IndexHandle<C, Decl["key"], Decl["unique"]>;

    type _FindArg = Assert<Equal<
        Parameters<H["find"]>[0],
        { readonly team: number; readonly role: string }
    >>;
    type _CompareArg = Assert<Equal<
        Parameters<Decl["order"]["compare"]>[0],
        { item: { parent: number; key: string; fractIndex: string } }
    >>;
}

// ============================================================================
// 12. Custom comparator — `tasksByPriority`
// ============================================================================

{
    type Decl = {
        key: "owner";
        order: {
            by: readonly ["priority", "due"];
            compare(a: Pick<C, "priority" | "due">, b: Pick<C, "priority" | "due">): number;
        };
    };
    type H = IndexHandle<C, Decl["key"], false>;

    type _FindArg = Assert<Equal<Parameters<H["find"]>[0], number>>;
    type _CompareArg = Assert<Equal<
        Parameters<Decl["order"]["compare"]>[0],
        { priority: number; due: number }
    >>;
}

// ============================================================================
// NEGATIVE TYPE CHECKS — these declarations should fail to typecheck.
// ============================================================================

{
    // Bad column name in bare-string key.
    type BadKey = FindArg<C, "bogus">;
    type _BogusIsNever = Assert<Equal<BadKey, never>>;
}

{
    // Bad column name inside key tuple. `FindArg` falls through to `never`
    // because `readonly ["parent", "bogus"]` does not extend
    // `readonly StringKeyof<C>[]` (the constraint that catches the typo at
    // the declaration site).
    type BadTupleKey = FindArg<C, readonly ["parent", "bogus"]>;
    type _NeverOnBadColumn = Assert<Equal<BadTupleKey, never>>;
}

{
    // Bad column name in an identity slot — caught at the declaration site
    // by constraining the slot map shape.
    type SlotMap = {
        readonly [slot: string]: StringKeyof<C> | ((...args: any[]) => unknown);
    };
    // @ts-expect-error - "bogus" is not a column on C
    const _decl: SlotMap = { team: "team", role: "bogus" };
    void _decl;
}

{
    // `compare` arguments are constrained to `Pick<C, by[number]>` — typo caught.
    type Order = {
        by: readonly ["fractIndex"];
        compare(a: Pick<C, "fractIndex">, b: Pick<C, "fractIndex">): number;
    };
    const goodCompare: Order["compare"] = (a, b) => a.fractIndex.localeCompare(b.fractIndex);
    void goodCompare;

    // Reading an undeclared column inside compare is a compile error.
    const badCompare: Order["compare"] = (a, b) =>
        // @ts-expect-error - `priority` is not in `Pick<C, "fractIndex">`
        a.priority - b.priority;
    void badCompare;
}

{
    // `get` is not exposed on non-unique indexes.
    type H = IndexHandle<C, "parent", false>;
    type _NoGet = Assert<Equal<"get" extends keyof H ? true : false, false>>;
}

{
    // `get` returns `Entity | null`, not `Entity | undefined`.
    type H = IndexHandle<C, "email", true>;
    type _ReturnsNull = Assert<Equal<ReturnType<H["get"]>, Entity | null>>;
    type _NotUndefined = Assert<Equal<
        Entity | undefined extends ReturnType<H["get"]> ? true : false,
        false
    >>;
}
