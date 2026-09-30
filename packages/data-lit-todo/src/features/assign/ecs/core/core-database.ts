// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { CoreDatabase as MainCoreDatabase } from "../../../main/ecs/core/core-database.js";
import { components } from "../../data/components/index.js";
import { archetypes } from "./archetypes.js";

// The assign feature's schema, on top of main's (this feature depends on main).
// The app root `imports` it so the store knows the columns up front; the feature's
// behavior loads lazily when its elements connect.
const coreDatabasePlugin = Database.Plugin.create({
  extends: MainCoreDatabase.plugin,
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
