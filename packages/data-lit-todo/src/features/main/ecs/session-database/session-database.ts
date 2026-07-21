// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { SettingsDatabase } from "../settings-database/settings-database.js";
import * as components from "./components/index.js";

// The session schema: local + ephemeral state — transient UI gesture state that
// neither persists across reloads nor replicates to peers. Everything added
// here is explicitly marked `nonPersistent: true` and `nonShared: true`.
const sessionDatabasePlugin = Database.Plugin.create({
  extends: SettingsDatabase.plugin,
  components: Database.scope.session(components),
});

export type SessionDatabase = Database.Plugin.ToDatabase<
  typeof sessionDatabasePlugin
>;

type SessionComponents = Store.Components<
  Database.Plugin.ToStore<typeof sessionDatabasePlugin>
>;

export namespace SessionDatabase {
  export const plugin = sessionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof sessionDatabasePlugin>;
  /** Index-declaration type bound to this database's components. */
  export type Index = Database.Index<SessionComponents>;
}
