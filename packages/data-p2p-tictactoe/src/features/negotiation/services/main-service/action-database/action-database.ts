// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ServiceDatabase } from "../service-database/service-database.js";
import * as actions from "./actions/index.js";

/**
 * The full negotiation database: state surface + the imperative `connection`
 * service + the UI-facing actions that drive it. Each action is a one-line
 * delegation, so a container element calls `service.actions.startHost()` and
 * never touches the full database.
 */
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
