// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { IndexDatabase } from "../indexes/index-database.js";
import * as transactions from "./index.js";

// Extends the indexed schema with the `transactions` facet: the discrete, atomic
// state changes the UI, actions and systems dispatch (set input, start a game, fire,
// resolve a hit, lose a life, refill a wave). Per-frame continuous motion is the
// systems layer's in-place column writes, not a transaction.
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
