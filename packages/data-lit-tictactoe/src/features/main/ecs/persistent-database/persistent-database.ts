// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";
import * as resources from "./resources/index.js";

// The persistent schema: the durable, serializable data model — every
// component and resource here is saved, replicated, and reasoned about as the
// feature's logical state. Nothing transient lives at this layer. Archetypes
// (a packing convenience, not persisted) live one layer up in the session
// database.
const persistentDatabasePlugin = Database.Plugin.create({
  components,
  resources,
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
  /**
   * The store this database's transactions and helpers operate on: entities,
   * resources, index handles, and the `userId` of the peer that initiated the
   * transaction. A store *is* the transaction context — there is no separate
   * transaction type.
   */
  export type Store = Database.Plugin.ToStore<typeof persistentDatabasePlugin>;
  /** Index-declaration type bound to this database's persistent components. */
  export type Index = Database.Index<PersistentComponents>;
}
