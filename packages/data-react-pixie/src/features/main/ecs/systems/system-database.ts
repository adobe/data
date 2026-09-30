// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { ActionDatabase } from "../actions/action-database.js";

// Systems sit atop the action layer, declared inline so each `create`'s `db` is
// inferred. Per-frame rotation is driven from the ui via the `tick` action, so this
// feature has only an init-only system.
const systemDatabasePlugin = Database.Plugin.create({
  extends: ActionDatabase.plugin,
  systems: {
    // Init-only: runs once at construction to populate the initial scene.
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
