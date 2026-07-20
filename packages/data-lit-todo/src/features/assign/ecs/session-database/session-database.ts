// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { Store } from "@adobe/data/ecs";
import { PersistentDatabase } from "../persistent-database/persistent-database.js";
import * as archetypes from "./archetypes/index.js";

// The session schema: the `User` archetype layered on the persistent columns.
// Archetypes are a physical packing convenience, not part of the serialized
// data model, so they live here rather than in the persistent database. Any
// component or resource added at this layer must be marked `nonPersistent: true`.
const sessionDatabasePlugin = Database.Plugin.create({
  extends: PersistentDatabase.plugin,
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
