// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ArchetypeDatabase } from "../archetype-database/archetype-database.js";
import * as indexes from "./indexes/index.js";

const indexDatabasePlugin = Database.Plugin.create({
  extends: ArchetypeDatabase.plugin,
  indexes,
});

export type IndexDatabase = Database.Plugin.ToDatabase<
  typeof indexDatabasePlugin
>;

export namespace IndexDatabase {
  export const plugin = indexDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof indexDatabasePlugin>;
}
