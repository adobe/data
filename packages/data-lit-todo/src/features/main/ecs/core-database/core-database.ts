// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { CoreDatabase as AssignSchema } from "../../../assign/ecs/core-database/core-database.js";
import { components } from "./components.js";
import { resources } from "./resources.js";
import { archetypes } from "./archetypes.js";

// The core schema, grouped by scope in components.ts / resources.ts. `imports`
// (not `extends`) the assign feature's schema so the store knows its columns up
// front — data coexists and persists — while main's type stays free of the
// feature; assign's behavior loads lazily.
const coreDatabasePlugin = Database.Plugin.create({
  imports: AssignSchema.plugin,
  components,
  resources,
  archetypes,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

type CoreComponents = Store.Components<
  Database.Plugin.ToStore<typeof coreDatabasePlugin>
>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  /** Index-declaration type bound to this database's components. */
  export type Index = Database.Index<CoreComponents>;
}
