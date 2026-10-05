// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { CoreDatabase } from "../core/core-database.js";
import * as transactions from "./index.js";

// No index layer (a dozen hazards scan fine), so transactions extend the core directly.
const transactionDatabasePlugin = Database.Plugin.create({
  extends: CoreDatabase.plugin,
  transactions,
});

export type TransactionDatabase = Database.Plugin.ToDatabase<typeof transactionDatabasePlugin>;

export namespace TransactionDatabase {
  export const plugin = transactionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof transactionDatabasePlugin>;
}
