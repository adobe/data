// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { CoreDatabase } from "./core-database.js";
import * as transactions from "./transactions/index.js";

const transactionDatabasePlugin = Database.Plugin.create({
  extends: CoreDatabase.plugin,
  transactions,
});

export type TransactionDatabase = Database.Plugin.ToDatabase<
  typeof transactionDatabasePlugin
>;

export namespace TransactionDatabase {
  export const plugin = transactionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof transactionDatabasePlugin>;
}
