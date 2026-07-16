// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "./transaction-database.js";
import * as computed from "./computed/index.js";

const todoDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  computed,
});

export type TodoDatabase = Database.Plugin.ToDatabase<typeof todoDatabasePlugin>;

export namespace TodoDatabase {
  export const plugin = todoDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof todoDatabasePlugin>;
}
