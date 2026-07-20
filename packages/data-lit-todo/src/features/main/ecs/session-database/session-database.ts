// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { PersistentDatabase } from "../persistent-database/persistent-database.js";
import * as components from "./components/index.js";
import * as resources from "./resources/index.js";
import * as archetypes from "./archetypes/index.js";

// The session schema: transient, session-only state layered on top of the
// persistent model. Every component and resource added here is explicitly
// marked `nonPersistent: true` so it is excluded from serialization. Archetypes
// live here too — they are a physical packing convenience, not part of the
// serialized data model.
const sessionDatabasePlugin = Database.Plugin.create({
  extends: PersistentDatabase.plugin,
  components,
  resources,
  archetypes,
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
