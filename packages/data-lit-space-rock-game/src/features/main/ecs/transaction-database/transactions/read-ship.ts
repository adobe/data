// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { Ship } from "../../../data/ship/ship.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// The single ship projected back to its data/ value, paired with its entity id
// (for in-place respawn). `undefined` before newGame has inserted one — every
// consumer guards and returns rather than assuming a ship exists.
export const readShip = (
  t: CoreDatabase.Store,
): { readonly entity: Entity; readonly ship: Ship } | undefined => {
  const [entity] = t.select(t.archetypes.Ship.components);
  if (entity === undefined) return undefined;
  const row = t.read(entity, t.archetypes.Ship);
  if (row === null) return undefined;
  return {
    entity,
    ship: { position: row.position, velocity: row.velocity, rotation: row.rotation },
  };
};
