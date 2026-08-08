// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transaction-database/transaction-database.js";
import * as actions from "./actions/index.js";

// Extends the transaction layer directly: this feature has no computed / service
// layers between them (no derivations, no external capability services).
const actionDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  actions,
});

export type ActionDatabase = Database.Plugin.ToDatabase<typeof actionDatabasePlugin>;

export namespace ActionDatabase {
  export const plugin = actionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof actionDatabasePlugin>;
}
