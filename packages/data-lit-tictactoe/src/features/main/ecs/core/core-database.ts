// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { components } from "../../data/components/index.js";
import { resources } from "../../data/resources/index.js";
import { archetypes } from "./archetypes.js";

// The core schema: the feature's data/ components and resources, packed into archetypes.
// Everything is document scope (shared + durable).
const coreDatabasePlugin = Database.Plugin.create({
  components,
  resources,
  archetypes,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

// Declared at module scope so the imported `Store` namespace isn't shadowed by
// `CoreDatabase.Store` below.
type CoreComponents = Store.Components<Database.Plugin.ToStore<typeof coreDatabasePlugin>>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  // The store transactions operate on (entities, resources, archetypes, indexes, `userId`).
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  // Index-declaration type bound to this database's components.
  export type Index = Database.Index<CoreComponents>;
}
