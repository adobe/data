// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ComputedDatabase } from "../computed/computed-database.js";
import * as actions from "./index.js";

// The feature's top layer — the plugin an assign element lazily extends the shared
// database with on first connect.
const actionDatabasePlugin = Database.Plugin.create({
  extends: ComputedDatabase.plugin,
  actions,
});

export type ActionDatabase = Database.Plugin.ToDatabase<typeof actionDatabasePlugin>;

export namespace ActionDatabase {
  export const plugin = actionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof actionDatabasePlugin>;
}
