// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import * as resources from "../data/resources/index.js";

const coreDatabasePlugin = Database.Plugin.create({
  resources,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  /**
   * The store this database's transactions operate on — resources, index
   * handles, and the initiating `userId`. A store *is* the transaction
   * context; there is no separate transaction type.
   */
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
}
