// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "./components/index.js";

// The assign feature's persistent schema: the shared `name`/`assignees` columns
// plus the `user` tag. `main` imports THIS plugin so the store knows the
// feature's persistent columns up front (persistence, data coexistence) without
// gaining its types or behavior. The feature's behavior (the `User` archetype,
// indexes, transactions, UI) loads lazily and extends the live database on top.
const documentDatabasePlugin = Database.Plugin.create({
  components: Database.scope.document(components),
});

export type DocumentDatabase = Database.Plugin.ToDatabase<
  typeof documentDatabasePlugin
>;

type DocumentComponents = Store.Components<
  Database.Plugin.ToStore<typeof documentDatabasePlugin>
>;

export namespace DocumentDatabase {
  export const plugin = documentDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof documentDatabasePlugin>;
  /** Index-declaration type bound to this feature's persistent components. */
  export type Index = Database.Index<DocumentComponents>;
}
