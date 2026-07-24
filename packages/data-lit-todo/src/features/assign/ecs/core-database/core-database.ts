// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { components } from "./components.js";
import { archetypes } from "./archetypes.js";

// The assign feature's schema. `main` imports THIS plugin so the store knows
// the feature's columns up front (persistence, data coexistence) without gaining
// its behavior. The feature's indexes, transactions, and UI load lazily on top.
const coreDatabasePlugin = Database.Plugin.create({
  components,
  archetypes,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

type CoreComponents = Store.Components<
  Database.Plugin.ToStore<typeof coreDatabasePlugin>
>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  export type Index = Database.Index<CoreComponents>;
}
