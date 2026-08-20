// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import type { Store } from "../../store/index.js";

/**
 * A patch over a schema namespace: `name: schema` adds or REPLACES that
 * component/resource's schema wholesale, `name: null` removes it. Schemas are
 * atomic values — a change replaces the whole schema, never a partial merge into
 * it — so a shape change (e.g. number → object) leaves no stale keys behind.
 *
 * A `null` removal takes effect when the load COMMITS (the component, being absent
 * from the current schema, is pruned) — not mid-replay. A handler that must keep a
 * removed component's data reads it (it is still present while the handler runs)
 * and writes it elsewhere; the component itself then drops on commit.
 *
 * Prefer TYPED schemas. An untyped/opaque schema (`{ default: x }`, no `type`/`enum`)
 * carries no shape, so the guard can only detect a change of the default's runtime
 * type — a same-typed shape change goes undetected (no handler demanded).
 */
export type SchemaChanges = Readonly<Record<string, Schema | null>>;

/**
 * One entry in an ordered version history. `entries[i]` IS version `i`: applying
 * its `changes` over the previous version's schema yields version `i`, so
 * `entries[0]` builds version 0 (the initial schema) from the empty base and
 * `currentVersion === entries.length - 1`. Folding every entry's `changes` from
 * `{}` reconstructs the current schema.
 *
 * Components and resources are patched separately so their namespaces stay
 * distinct (a `Schema` can't say which it is) and so a component↔resource move is
 * expressible as a removal in one plus an add in the other.
 *
 * `handler` is present **iff** the change is not automatically convertible (a
 * *major* change — a type change, split, cross-component move, …). It runs against
 * the document store already staged to the schema of version `i - 1` — the input
 * this entry transforms — so it sees a known shape for every component (no pinning
 * needed) and transforms the data in place. Additive / minor / removal changes
 * carry no handler — load-time conversion handles them.
 */
export type VersionEntry = {
    /**
     * This entry's version — must equal its **index** (so version 0 is the initial
     * schema and `currentVersion === entries.length - 1`). Redundant with position,
     * but makes a long history scannable; the guard test verifies it.
     */
    readonly version: number;
    readonly changes: {
        readonly components?: SchemaChanges;
        readonly resources?: SchemaChanges;
    };
    readonly handler?: (store: Store<any, any, any>) => void | Promise<void>;
};
