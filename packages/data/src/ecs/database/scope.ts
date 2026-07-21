// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "../../schema/index.js";

type SchemaMap = Record<string, Schema>;

// Return a copy of `map` with `flags` merged onto every schema. Keys and value
// shapes are preserved, so the caller's specific map type carries through.
const stamp = <M extends SchemaMap>(map: M, flags: Partial<Schema>): M => {
    const out: SchemaMap = {};
    for (const [name, schema] of Object.entries(map)) {
        out[name] = { ...schema, ...flags };
    }
    // Invariant: `out` has exactly `map`'s keys and Schema values — same shape as M.
    return out as M;
};

/**
 * Scope tags for a layer's component/resource map, applied once where the layer
 * is composed (e.g. `components: Database.scope.session(components)`). Each
 * stamps the flag pair that marks the schema's scope on the two orthogonal axes
 * — shared vs. local (`nonShared`) and durable vs. ephemeral (`nonPersistent`):
 *
 * - `document` — shared + durable: the collaborative, serialized model (no flags).
 * - `settings` — local + durable: per-device preferences (`nonShared`).
 * - `presence` — shared + ephemeral: live awareness (`nonPersistent`).
 * - `session`  — local + ephemeral: transient UI state (both).
 *
 * `document` is identity — it returns the same map (and same schema object
 * references), so shared columns re-exported across features still dedupe.
 */
export const scope = {
    document: <M extends SchemaMap>(map: M): M => map,
    settings: <M extends SchemaMap>(map: M): M => stamp(map, { nonShared: true }),
    presence: <M extends SchemaMap>(map: M): M => stamp(map, { nonPersistent: true }),
    session: <M extends SchemaMap>(map: M): M => stamp(map, { nonPersistent: true, nonShared: true }),
};
