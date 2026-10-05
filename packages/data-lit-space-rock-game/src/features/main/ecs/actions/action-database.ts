// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ComputedDatabase } from "../computed/computed-database.js";
import * as actions from "./index.js";

// Extends the service database with the `actions` facet: the app-facing
// operations the UI calls.
const actionDatabasePlugin = Database.Plugin.create({
  extends: ComputedDatabase.plugin,
  actions,
});

export type ActionDatabase = Database.Plugin.ToDatabase<typeof actionDatabasePlugin>;

export namespace ActionDatabase {
  export const plugin = actionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof actionDatabasePlugin>;
}
