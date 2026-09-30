// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { resources } from "../../data/resources/index.js";

// The core schema: the feature's data/ resources. No entities, so no components or archetypes.
const coreDatabasePlugin = Database.Plugin.create({
  resources,
});

export type CoreDatabase = Database.Plugin.ToDatabase<typeof coreDatabasePlugin>;

export namespace CoreDatabase {
  export const plugin = coreDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof coreDatabasePlugin>;
}
