// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transaction-database/transaction-database.js";
import * as computed from "./computed/index.js";

// Extends the transaction layer with the derived observable values the UI reads.
// Each computed only wires a db observable to a pure `data/` derivation.
const computedDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  computed,
});

export type ComputedDatabase = Database.Plugin.ToDatabase<
  typeof computedDatabasePlugin
>;

export namespace ComputedDatabase {
  export const plugin = computedDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof computedDatabasePlugin>;
}
