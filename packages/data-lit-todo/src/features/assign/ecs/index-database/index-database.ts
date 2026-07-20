// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { CoreDatabase } from "./core-database.js";
import * as indexes from "./indexes/index.js";

const indexDatabasePlugin = Database.Plugin.create({
  extends: CoreDatabase.plugin,
  indexes,
});

export type IndexDatabase = Database.Plugin.ToDatabase<
  typeof indexDatabasePlugin
>;

export namespace IndexDatabase {
  export const plugin = indexDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof indexDatabasePlugin>;
}
