// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "./transaction-database.js";
import * as actions from "./actions/index.js";

/**
 * Optional presence plugin. Combine with the base game plugin at the sample
 * level:
 *
 * ```ts
 * const gamePlugin = Database.Plugin.combine(tictactoePlugin, PresenceDatabase.plugin);
 * ```
 *
 * Presence lives in `data-p2p-tictactoe`, not in `data-lit-tictactoe`, because
 * it is a P2P-specific concern — standalone / AI play has no remote cursors.
 */
const presenceDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  actions,
});

export type PresenceDatabase = Database.Plugin.ToDatabase<
  typeof presenceDatabasePlugin
>;

export namespace PresenceDatabase {
  export const plugin = presenceDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof presenceDatabasePlugin>;
}
