// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { DocumentDatabase } from "../document-database/document-database.js";
import * as resources from "./resources/index.js";

// The settings schema: local + durable state — per-device user preferences that
// persist across reloads but are never replicated to peers. Everything added
// here is explicitly marked `nonShared: true`.
const settingsDatabasePlugin = Database.Plugin.create({
  extends: DocumentDatabase.plugin,
  resources: Database.scope.settings(resources),
});

export type SettingsDatabase = Database.Plugin.ToDatabase<
  typeof settingsDatabasePlugin
>;

type SettingsComponents = Store.Components<
  Database.Plugin.ToStore<typeof settingsDatabasePlugin>
>;

export namespace SettingsDatabase {
  export const plugin = settingsDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof settingsDatabasePlugin>;
  /** Index-declaration type bound to this database's components. */
  export type Index = Database.Index<SettingsComponents>;
}
