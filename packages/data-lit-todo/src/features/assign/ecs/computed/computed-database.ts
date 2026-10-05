// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transactions/transaction-database.js";
import * as computed from "./index.js";

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
