// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { components } from "./components.js";
import { resources } from "./resources.js";
import { archetypes } from "./archetypes.js";

// The feature's whole schema, grouped by scope in components.ts / resources.ts.
const coreDatabasePlugin = Database.Plugin.create({
  components,
  resources,
  archetypes,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
}
