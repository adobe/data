// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";
import * as archetypes from "./archetypes/index.js";

// The assign feature's schema layer: the `User` archetype plus the shared
// `name`/`assignees` columns. `main` imports THIS plugin so the store knows the
// feature's schemas up front (persistence, data coexistence) without gaining
// its types or behavior. The feature's behavior (indexes, transactions, UI)
// loads lazily and extends the live database on top of this.
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
  /** Index-declaration type bound to this feature's components. */
  export type Index = Database.Index<CoreComponents>;
}
