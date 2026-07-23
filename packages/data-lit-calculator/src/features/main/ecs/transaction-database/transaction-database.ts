// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { CoreDatabase } from "../core-database/core-database.js";
import * as transactions from "./transactions/index.js";

// The calculator has no query indexes, so the transaction layer extends the
// core schema directly, adding the atomic mutations over the `calculator`
// resource.
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
