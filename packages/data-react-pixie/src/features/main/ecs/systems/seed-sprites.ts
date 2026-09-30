// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ActionDatabase } from "../actions/action-database.js";

// Init-only: `create` runs once at database construction to populate the initial
// scene and returns no per-frame function. System `create` receives the database
// plus its raw `store`.
export const seedSprites = {
  create: (db: ActionDatabase & { readonly store: ActionDatabase.Store }) => {
    db.store.archetypes.Sprite.insert({ position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false });
    db.store.archetypes.Sprite.insert({ position: [200, 150], rotation: 0.5, kind: "bunny", hovered: false, active: false });
    db.store.archetypes.Sprite.insert({ position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false });
    db.store.archetypes.Sprite.insert({ position: [150, 250], rotation: 0.2, kind: "fox", hovered: false, active: false });
  },
};
