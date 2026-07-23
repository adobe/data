// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { CoreDatabase } from "../core-database/core-database.js";
import * as indexes from "./indexes/index.js";

// Extends the core schema with the `indexes` facet. `create` validates every
// index descriptor against the real component/archetype facets (an
// archetype-scoped index would need a field the `CoreDatabase.Index` helper
// can't express; `byCell` is column-scoped so it validates with `satisfies`).
const indexDatabasePlugin = Database.Plugin.create({
  extends: CoreDatabase.plugin,
  indexes,
});

export type IndexDatabase = Database.Plugin.ToDatabase<typeof indexDatabasePlugin>;

export namespace IndexDatabase {
  export const plugin = indexDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof indexDatabasePlugin>;
}
