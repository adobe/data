// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { DocumentDatabase } from "../document-database/document-database.js";
import * as archetypes from "./archetypes/index.js";

// The archetype layer: named entity shapes (packing layouts). Archetypes are a
// physical iteration/packing convenience, not part of the serialized data
// model, so they live above the schema-scope layers rather than in them. It
// extends the topmost scope layer so an archetype may span components from any
// scope the feature defines.
const archetypeDatabasePlugin = Database.Plugin.create({
  extends: DocumentDatabase.plugin,
  archetypes,
});

export type ArchetypeDatabase = Database.Plugin.ToDatabase<
  typeof archetypeDatabasePlugin
>;

type ArchetypeComponents = Store.Components<
  Database.Plugin.ToStore<typeof archetypeDatabasePlugin>
>;

export namespace ArchetypeDatabase {
  export const plugin = archetypeDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof archetypeDatabasePlugin>;
  /** Index-declaration type bound to this database's components. */
  export type Index = Database.Index<ArchetypeComponents>;
}
