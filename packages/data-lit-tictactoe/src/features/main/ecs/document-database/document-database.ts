// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";
import * as resources from "./resources/index.js";

// The document schema: shared + durable state — the collaborative, serialized
// data model every peer saves, syncs, and reasons about as the feature's
// logical state. No local or transient state here (see the settings / session
// scopes), and no archetypes (a packing convenience — the archetype layer).
const documentDatabasePlugin = Database.Plugin.create({
  components,
  resources,
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
  /**
   * The store this database's transactions and helpers operate on: entities,
   * resources, index handles, and the `userId` of the peer that initiated the
   * transaction. A store *is* the transaction context — there is no separate
   * transaction type.
   */
  export type Store = Database.Plugin.ToStore<typeof documentDatabasePlugin>;
  /** Index-declaration type bound to this database's persistent components. */
  export type Index = Database.Index<DocumentComponents>;
}
