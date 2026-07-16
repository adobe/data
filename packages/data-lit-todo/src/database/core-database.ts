// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import * as components from "../data/components/index.js";
import * as resources from "../data/resources/index.js";
import * as archetypes from "../data/archetypes/index.js";

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
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  /**
   * Index-declaration type bound to this database's components. Use it as a
   * `satisfies` target on a standalone index literal to validate `key`
   * against real columns without re-deriving the component map:
   *
   * ```ts
   * export const byComplete = { key: "complete" } as const satisfies CoreDatabase.Index;
   * ```
   */
  export type Index = Database.Index<CoreComponents>;
}
