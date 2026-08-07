// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { Sprite } from "../../../data/sprite/sprite.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its `data/` value — the per-entity projection
// `toState` is built on, and the single place the ecs↔data mapping for a sprite
// lives. The projected `id` is the entity id (the ecs's own id-space, not the
// spec's domain id), so cases author `after` ids as `anyNumber`. Test-only.
export const toData = (store: CoreDatabase.Store, entity: Entity): Sprite => {
  const row = store.read(entity, store.archetypes.Sprite);
  if (row === null) throw new Error("conformance projection: expected a sprite entity");
  return {
    id: row.id,
    position: row.position,
    rotation: row.rotation,
    kind: row.kind,
    hovered: row.hovered,
    active: row.active,
  };
};
