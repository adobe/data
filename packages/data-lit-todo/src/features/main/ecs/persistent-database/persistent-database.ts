// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";
import { PersistentDatabase as AssignSchema } from "../../../assign/ecs/persistent-database/persistent-database.js";

// The persistent schema: the durable, serializable data model — the columns a
// human reasons about as the feature's logical state, and the set a bare store
// could be built from for reconciliation. Transient session state and the
// archetype packing layout live one layer up in the session database.
//
// `imports` (not `extends`) the assign feature's persistent schema: the store
// gains that feature's columns at runtime so all schemas coexist and persist,
// while main's *type* stays free of the feature — the one sanctioned core→child
// link. The feature's behavior (archetypes, indexes, transactions, UI) loads
// lazily.
const persistentDatabasePlugin = Database.Plugin.create({
  imports: AssignSchema.plugin,
  components,
});

export type PersistentDatabase = Database.Plugin.ToDatabase<
  typeof persistentDatabasePlugin
>;

// Resolved component map for this database. Declared at module scope so the
// imported `Store` namespace isn't shadowed by `PersistentDatabase.Store` below.
type PersistentComponents = Store.Components<
  Database.Plugin.ToStore<typeof persistentDatabasePlugin>
>;

export namespace PersistentDatabase {
  export const plugin = persistentDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof persistentDatabasePlugin>;
  /**
   * Index-declaration type bound to this database's persistent components. Use
   * it as a `satisfies` target on a standalone index literal to validate `key`
   * against real columns without re-deriving the component map:
   *
   * ```ts
   * export const byComplete = { key: "complete" } as const satisfies PersistentDatabase.Index;
   * ```
   */
  export type Index = Database.Index<PersistentComponents>;
}
