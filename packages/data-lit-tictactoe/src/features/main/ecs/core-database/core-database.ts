// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";
import * as resources from "./resources/index.js";
import * as archetypes from "./archetypes/index.js";

const coreDatabasePlugin = Database.Plugin.create({
  components,
  resources,
  archetypes,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

// Resolved component map for this database. Declared at module scope so the
// imported `Store` namespace isn't shadowed by `CoreDatabase.Store` below.
type CoreComponents = Store.Components<
  Database.Plugin.ToStore<typeof coreDatabasePlugin>
>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  /**
   * The store this database's transactions and helpers operate on: entities,
   * resources, index handles, and the `userId` of the peer that initiated the
   * transaction (used by `playMove` for per-player authorization). A store
   * *is* the transaction context — there is no separate transaction type.
   */
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  /** Index-declaration type bound to this database's components. */
  export type Index = Database.Index<CoreComponents>;
}
