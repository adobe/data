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
  /** Store as seen inside a transaction body — includes `userId`. */
  export type Transaction = Database.Plugin.ToTransactionContext<
    typeof coreDatabasePlugin
  >;
}
