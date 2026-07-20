// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";

// The assign feature's persistent schema: the shared `name`/`assignees` columns
// plus the `user` tag. `main` imports THIS plugin so the store knows the
// feature's persistent columns up front (persistence, data coexistence) without
// gaining its types or behavior. The feature's behavior (the `User` archetype,
// indexes, transactions, UI) loads lazily and extends the live database on top.
const persistentDatabasePlugin = Database.Plugin.create({
  components,
});

export type PersistentDatabase = Database.Plugin.ToDatabase<
  typeof persistentDatabasePlugin
>;

type PersistentComponents = Store.Components<
  Database.Plugin.ToStore<typeof persistentDatabasePlugin>
>;

export namespace PersistentDatabase {
  export const plugin = persistentDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof persistentDatabasePlugin>;
  /** Index-declaration type bound to this feature's persistent components. */
  export type Index = Database.Index<PersistentComponents>;
}
