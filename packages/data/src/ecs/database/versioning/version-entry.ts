// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import type { Store } from "../../store/index.js";

/**
 * A patch over a schema namespace: `name: schema` adds or REPLACES that
 * component/resource's schema wholesale, `name: null` removes it. Schemas are
 * atomic values — a change replaces the whole schema, never a partial merge into
 * it — so a shape change (e.g. number → object) leaves no stale keys behind.
 */
export type SchemaChanges = Readonly<Record<string, Schema | null>>;

/**
 * One entry in an ordered version history. `entries[i]` transforms a document
 * from version `i` to version `i + 1`; `entries[0]` builds the initial schema
 * from the empty base, so `currentVersion === entries.length` and folding every
 * entry's `changes` from `{}` reconstructs the current schema.
 *
 * Components and resources are patched separately so their namespaces stay
 * distinct (a `Schema` can't say which it is) and so a component↔resource move is
 * expressible as a removal in one plus an add in the other.
 *
 * `handler` is present **iff** the change is not automatically convertible (a
 * *major* change — a type change, split, cross-component move, …). It runs against
 * the document store already staged to the schema of version `i` (so it sees a
 * known input for every component, no pinning needed) and transforms the data in
 * place. Additive / minor / removal changes carry no handler — load-time
 * conversion handles them.
 */
export type VersionEntry = {
    readonly changes: {
        readonly components?: SchemaChanges;
        readonly resources?: SchemaChanges;
    };
    readonly handler?: (store: Store<any, any, any>) => void | Promise<void>;
};
