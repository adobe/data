// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import * as resources from "../data/resources/index.js";

const coreDatabasePlugin = Database.Plugin.create({
  resources,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
  /**
   * The store as seen inside a transaction body — `Store` plus the `userId`
   * of the peer that initiated the transaction. Used by transactions that
   * enforce per-player authorization (e.g. `playMove`).
   */
  export type Transaction = Database.Plugin.ToTransactionContext<
    typeof coreDatabasePlugin
  >;
}
