// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TransactionDatabase } from "../transaction-database/transaction-database.js";

// Systems come last in the pipeline, atop the feature's current top layer
// (transactions). `seedSprites` is init-only: its `create` runs ONCE at database
// construction to populate the initial scene and returns `void` (no per-frame
// work). Per-frame rotation is driven from the ui via the `tick` transaction, so
// this feature needs no scheduler.
const systemDatabasePlugin = Database.Plugin.create({
  extends: TransactionDatabase.plugin,
  systems: {
    seedSprites: {
      create: (db) => {
        db.store.archetypes.Sprite.insert({ position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false });
        db.store.archetypes.Sprite.insert({ position: [200, 150], rotation: 0.5, kind: "bunny", hovered: false, active: false });
        db.store.archetypes.Sprite.insert({ position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false });
        db.store.archetypes.Sprite.insert({ position: [150, 250], rotation: 0.2, kind: "fox", hovered: false, active: false });
      },
    },
  },
});

export type SystemDatabase = Database.Plugin.ToDatabase<typeof systemDatabasePlugin>;

export namespace SystemDatabase {
  export const plugin = systemDatabasePlugin;
  export type Store = Database.Plugin.ToStore<typeof systemDatabasePlugin>;
}
