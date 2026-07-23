// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Database } from "./database.js";

/**
 * Re-view a created database as its **system surface** — the same
 * `Database & { store }` type a `SystemDeclaration.create` receives — exposing
 * the writable `store` (and writable `services`).
 *
 * Identity at runtime: `createDatabase` always attaches the store, so this only
 * reveals it to the type system. It is the widening twin of `UIService.restrict`
 * (which narrows a full database to the read-only UI view). Direct `store`
 * access does NOT flow through observable transactions — intended for systems,
 * and for test-support (a conformance projection seeding the store directly).
 *
 * Cast-free by the same overload + broadened-impl shape `restrict` uses: the
 * public overload returns the widened `ToSystemDatabase<P>`, which is assignable
 * to the impl's plain `Database` return, so the identity body type-checks.
 */
export function toSystemDatabase<P extends Database.Plugin>(
  db: Database.FromPlugin<P>,
): Database.Plugin.ToSystemDatabase<P>;
export function toSystemDatabase(
  db: Database<any, any, any, any, any, any, any, any>,
): Database<any, any, any, any, any, any, any, any> {
  return db;
}
