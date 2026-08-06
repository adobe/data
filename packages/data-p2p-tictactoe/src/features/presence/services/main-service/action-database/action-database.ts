// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transaction-database/transaction-database.js";
import * as actions from "./actions/index.js";

/**
 * The assembled presence plugin: state surface + the `trackPresence` action.
 * Combined onto the synced game database at the app shell (see the `p2p-app`
 * composition) — presence is a P2P-specific concern, so it lives here rather than
 * in the standalone game library.
 */
const actionDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  actions,
});

export type ActionDatabase = Database.Plugin.ToDatabase<
  typeof actionDatabasePlugin
>;

export namespace ActionDatabase {
  export const plugin = actionDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof actionDatabasePlugin>;
}
