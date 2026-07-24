// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { components } from "./components.js";
import { resources } from "./resources.js";
import { archetypes } from "./archetypes.js";

// The core schema: every component, resource, and archetype for the feature,
// grouped by scope inside components.ts / resources.ts. Asteroids is
// session-only (local + ephemeral) — no document/settings/presence state.
const coreDatabasePlugin = Database.Plugin.create({
  components,
  resources,
  archetypes,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

// Resolved component map, declared at module scope so the imported `Store`
// namespace isn't shadowed by `CoreDatabase.Store` below.
type CoreComponents = Store.Components<
  Database.Plugin.ToStore<typeof coreDatabasePlugin>
>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  /**
   * The store this database's transactions operate on: entities, resources,
   * archetypes, index handles, and the initiating `userId`. A store *is* the
   * transaction context — there is no separate transaction type.
   */
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  /** Index-declaration type bound to this database's components. */
  export type Index = Database.Index<CoreComponents>;
}
