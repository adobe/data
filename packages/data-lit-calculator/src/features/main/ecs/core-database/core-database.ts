// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { resources } from "./resources.js";

// The core schema for the calculator feature. The calculator has no entities:
// its whole state is one singleton `calculator` resource (session scope), so
// there are no components and no archetypes — nothing here persists or syncs.
const coreDatabasePlugin = Database.Plugin.create({
  resources,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  /**
   * The store this database's transactions operate on: entities, resources,
   * archetypes, index handles, and the initiating `userId`. A store *is* the
   * transaction context — there is no separate transaction type.
   */
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
}
