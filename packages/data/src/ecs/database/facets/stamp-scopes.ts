// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "../../../schema/index.js";

type SchemaMap = { readonly [key: string]: Schema };

/**
 * The four schema scopes, grouped for a facet builder ({@link stampScopes},
 * `Database.components`, `Database.resources`). Every scope is optional and
 * defaults to empty — declare only the scopes a feature actually uses.
 *
 * State divides on two orthogonal axes — **scope** (shared with peers vs. local
 * to this client) and **lifetime** (durable across reloads vs. ephemeral) — and
 * each group stamps the flag pair for its quadrant.
 */
export type ScopeGroups<D, S, P, Se> = {
    /**
     * **document** — shared + durable. The collaborative, serialized data model:
     * replicated to every peer and saved to storage. The default home for
     * feature state; carries no scope flags.
     */
    document?: D;
    /**
     * **settings** — local + durable. Per-device state that persists across
     * reloads but is never sent to peers (e.g. a view toggle, theme, panel
     * layout). Stamped `nonShared: true`.
     */
    settings?: S;
    /**
     * **presence** — shared + ephemeral. Live awareness replicated to peers but
     * never saved (e.g. cursors, selections, "typing…"). Dies with the session.
     * Stamped `nonPersistent: true`.
     */
    presence?: P;
    /**
     * **session** — local + ephemeral. Transient UI state that is neither saved
     * nor shared (e.g. a drag offset, hover target, focus). Stamped both
     * `nonPersistent: true` and `nonShared: true`.
     */
    session?: Se;
};

// Copy a map with `flags` merged onto every schema, preserving the map type.
const stamp = <M extends SchemaMap>(map: M, flags: Partial<Schema>): M => {
    const out: Record<string, Schema> = {};
    for (const [name, schema] of Object.entries(map)) {
        out[name] = { ...schema, ...flags };
    }
    // Invariant: `out` has exactly `map`'s keys and Schema values — same shape as M.
    return out as M;
};

/**
 * Merge the provided schema scopes into one flag-tagged map. Omitted scopes are
 * empty. Shared by `Database.components` and `Database.resources`.
 */
export function stampScopes<
    D extends SchemaMap, S extends SchemaMap, P extends SchemaMap, Se extends SchemaMap,
>(groups: ScopeGroups<D, S, P, Se>): D & S & P & Se {
    const merged = {
        // document has no flags — pass schemas through by identity so a column
        // shared across features (same data/ schema) still dedupes in combinePlugins.
        ...(groups.document ?? {}),
        ...stamp(groups.settings ?? {}, { nonShared: true }),
        ...stamp(groups.presence ?? {}, { nonPersistent: true }),
        ...stamp(groups.session ?? {}, { nonPersistent: true, nonShared: true }),
    };
    // Invariant: `merged` has exactly the keys of the provided groups.
    return merged as D & S & P & Se;
}
