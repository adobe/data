// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { PlacedMark } from "../../../data/placed-mark/placed-mark.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its `data/` value — the per-entity projection
// `toState` is built on, and the single place the ecs↔data mapping for a placed
// mark lives. Test-only.
export const toData = (store: CoreDatabase.Store, entity: Entity): PlacedMark => {
  const row = store.read(entity, store.archetypes.PlacedMark);
  if (row === null) throw new Error("conformance projection: expected a placed-mark entity");
  return { mark: row.mark, index: row.index };
};
