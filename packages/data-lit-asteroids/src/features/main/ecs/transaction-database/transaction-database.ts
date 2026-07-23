// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { IndexDatabase } from "../index-database/index-database.js";
import * as transactions from "./transactions/index.js";

// Extends the indexed schema with the `transactions` facet: the discrete,
// atomic state changes the UI and systems dispatch (set input, start a game,
// spawn a wave, fire, resolve a hit, lose a life). Each is thin over the pure
// data/ transform it stands for; per-frame continuous motion is the systems
// layer, not a transaction.
const transactionDatabasePlugin = Database.Plugin.create({
  extends: IndexDatabase.plugin,
  transactions,
});

export type TransactionDatabase = Database.Plugin.ToDatabase<
  typeof transactionDatabasePlugin
>;

export namespace TransactionDatabase {
  export const plugin = transactionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof transactionDatabasePlugin>;
}
