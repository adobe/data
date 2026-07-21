// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";
import { DocumentDatabase as AssignSchema } from "../../../assign/ecs/document-database/document-database.js";

// The document schema: shared + durable state — the collaborative, serialized
// data model every peer saves and syncs, and the set a bare store could be
// rebuilt from for reconciliation. Local settings, transient session state, and
// the archetype packing layout each live in their own layer above this one.
//
// `imports` (not `extends`) the assign feature's document schema: the store
// gains that feature's columns at runtime so all schemas coexist and persist,
// while main's *type* stays free of the feature — the one sanctioned core→child
// link. The feature's behavior (archetypes, indexes, transactions, UI) loads
// lazily.
const documentDatabasePlugin = Database.Plugin.create({
  imports: AssignSchema.plugin,
  components,
});

export type DocumentDatabase = Database.Plugin.ToDatabase<
  typeof documentDatabasePlugin
>;

// Resolved component map for this database. Declared at module scope so the
// imported `Store` namespace isn't shadowed by `DocumentDatabase.Store` below.
type DocumentComponents = Store.Components<
  Database.Plugin.ToStore<typeof documentDatabasePlugin>
>;

export namespace DocumentDatabase {
  export const plugin = documentDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof documentDatabasePlugin>;
  /**
   * Index-declaration type bound to this database's document components. Use it
   * as a `satisfies` target on a standalone index literal to validate `key`
   * against real columns without re-deriving the component map:
   *
   * ```ts
   * export const byComplete = { key: "complete" } as const satisfies DocumentDatabase.Index;
   * ```
   */
  export type Index = Database.Index<DocumentComponents>;
}
