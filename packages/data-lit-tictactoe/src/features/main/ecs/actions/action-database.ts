// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ServiceDatabase } from "../services/service-database.js";
import * as actions from "./index.js";

const actionDatabasePlugin = Database.Plugin.create({
  extends: ServiceDatabase.plugin,
  actions,
});

export type ActionDatabase = Database.Plugin.ToDatabase<
  typeof actionDatabasePlugin
>;

export namespace ActionDatabase {
  export const plugin = actionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof actionDatabasePlugin>;
}
