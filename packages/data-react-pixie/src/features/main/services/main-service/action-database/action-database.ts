// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transaction-database/transaction-database.js";
import * as actions from "./actions/index.js";

// The action layer: the async, app-facing realizations of the state transitions.
// This feature injects no capability services, so actions extend the transaction
// layer directly (the lowest layer exposing `db.transactions`).
const actionDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  actions,
});

export type ActionDatabase = Database.Plugin.ToDatabase<typeof actionDatabasePlugin>;

export namespace ActionDatabase {
  export const plugin = actionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof actionDatabasePlugin>;
}
