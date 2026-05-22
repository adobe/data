// © 2026 Adobe. MIT License. See /LICENSE for details.

import { StringKeyof } from "../../types/types.js";
import { Filter } from "../../table/select-rows.js";
import type { Entity } from "../entity/entity.js";
import { Components } from "./components.js";

/**
 * Type-level declaration of an index over one or more components.
 *
 * - `components`: ordered, non-empty tuple of component keys. Order is
 *   significant — it defines both the sort order the index produces and
 *   the prefixes of a `where` / `order` clause the index can serve.
 * - `unique`: when `true`, at most one entity may hold each key tuple.
 *   Required to expose `Handle.get`. Defaults to `false`.
 *
 * Every key in `components` is statically checked against the store's
 * component map `C`; an unknown name is a compile error at the plugin
 * declaration site.
 *
 * Defined here (lowest layer) rather than in `database/database.ts` so the
 * `Store` interface can reference `Handle` for its `indexes` field without
 * causing a `store → database` import cycle. The `Database.Index` namespace
 * in `database/database.ts` re-exports these types as the user-facing API.
 */
export type Index<
    C extends Components = any,
    Keys extends readonly [StringKeyof<C>, ...StringKeyof<C>[]] = any,
    Unique extends boolean = false,
> = {
    readonly components: Keys;
    readonly unique?: Unique;
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Index {
    /**
     * Per-index lookup handle exposed on `db.indexes.<name>` and on
     * `t.indexes.<name>` (inside transactions).
     *
     * Conditional intersection adds `get` only when `Unique` is exactly
     * `true`, so `indexes.<nonUnique>.get(...)` is a type error at the
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

/**
 * Plugin-level / store-level map of indexes. Keys are user-chosen index
 * names; values are `Index` declarations whose `components` tuple must
 * reference real keys of `C`. The constraint is shaped to allow
 * `RemoveIndex<...>` to strip the index signature and recover the literal
 * map at the call site (same pattern as `ArchetypeComponents`).
 */
export type IndexDeclarations<C extends Components = any> = {
    readonly [name: string]: Index<C, readonly [StringKeyof<C>, ...StringKeyof<C>[]], boolean>;
};
