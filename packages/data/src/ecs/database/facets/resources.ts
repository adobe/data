// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ResourceSchemas } from "../../resource-schemas.js";
import { stampScopes, type ScopeGroups } from "./stamp-scopes.js";

/**
 * Build a feature's resource facet map from its schema scopes, stamping each
 * scope's flags (see {@link ScopeGroups}). Declare only the scopes you use.
 * Identical to `Database.components` except every entry must be a
 * `ResourceSchema` (a `Schema` with a `default`) — a missing `default` is a
 * compile error here, at the declaration site.
 *
 * ```ts
 * export const resources = Database.resources({
 *   settings: { displayCompleted: Boolean.schema },
 * });
 * ```
 */
export function resources<
    D extends ResourceSchemas = {}, S extends ResourceSchemas = {},
    P extends ResourceSchemas = {}, Se extends ResourceSchemas = {},
>(groups: ScopeGroups<D, S, P, Se>): D & S & P & Se {
    return stampScopes(groups);
}
