// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ActionDatabase } from "../actions/action-database.js";
import * as systems from "./index.js";

// Systems sit atop the action layer. Per-frame rotation is driven from the ui via the
// `tick` action, so this feature needs no scheduled system.
const systemDatabasePlugin = Database.Plugin.create({
  extends: ActionDatabase.plugin,
  systems,
});

export type SystemDatabase = Database.Plugin.ToDatabase<typeof systemDatabasePlugin>;

export namespace SystemDatabase {
  export const plugin = systemDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof systemDatabasePlugin>;
}
