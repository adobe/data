// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "./transaction-database.js";
import * as computed from "./computed/index.js";

const tictactoeDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  computed,
});

export type TictactoeDatabase = Database.Plugin.ToDatabase<
  typeof tictactoeDatabasePlugin
>;

export namespace TictactoeDatabase {
  export const plugin = tictactoeDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof tictactoeDatabasePlugin>;
}
