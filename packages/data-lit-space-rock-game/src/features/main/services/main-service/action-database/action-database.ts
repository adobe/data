// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ServiceDatabase } from "../service-database/service-database.js";
import * as actions from "./actions/index.js";

// Extends the service database with the `actions` facet: the async, app-facing
// realizations that orchestrate a `services/` port and commit through a single
// transaction. Per-frame step transitions are realized by the `systems` layer
// (conformed via the tick-loop), not by actions.
const actionDatabasePlugin = Database.Plugin.create({
  extends: ServiceDatabase.plugin,
  actions,
});

export type ActionDatabase = Database.Plugin.ToDatabase<typeof actionDatabasePlugin>;

export namespace ActionDatabase {
  export const plugin = actionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof actionDatabasePlugin>;
}
