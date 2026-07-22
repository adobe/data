// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComponentSchemas } from "../../component-schemas.js";
import type { Simplify } from "../../../types/index.js";
import { stampScopes, type ScopeGroups } from "./stamp-scopes.js";

/**
 * Build a feature's component facet map from its schema scopes, stamping each
 * scope's flags (see {@link ScopeGroups}). Declare only the scopes you use —
 * a document-only feature is just `{ document: { … } }`. Component entries are
 * any `Schema`; no `default` required (unlike `Database.resources`).
 *
 * ```ts
 * export const components = Database.components({
 *   document: { mark: PlayerMark.schema },
 *   session: { dragPosition: DragPosition.schema },
 * });
 * ```
 */
export function components<
    D extends ComponentSchemas = {}, S extends ComponentSchemas = {},
    P extends ComponentSchemas = {}, Se extends ComponentSchemas = {},
>(groups: ScopeGroups<D, S, P, Se>): Simplify<D & S & P & Se> {
    return stampScopes(groups);
}
