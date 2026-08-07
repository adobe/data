// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { Ship } from "../../../data/ship/ship.js";
import type { Bullet } from "../../../data/bullet/bullet.js";
import type { Asteroid } from "../../../data/asteroid/asteroid.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read one entity back into its `data/` value — the per-entity projection
// `toState` is built on, and the single place the ecs↔data mapping for the three
// entity kinds lives. Unlike a single-archetype feature (todo), an entity here is
// one of Ship / Bullet / Asteroid, so `toData` probes each named archetype (their
// component sets are distinct — only Ship has `rotation`, only Bullet `age`, only
// Asteroid `size`) and projects the first that matches. Test-only.
export const toData = (store: CoreDatabase.Store, entity: Entity): Ship | Bullet | Asteroid => {
  const ship = store.read(entity, store.archetypes.Ship);
  if (ship !== null) return { position: ship.position, velocity: ship.velocity, rotation: ship.rotation };
  const bullet = store.read(entity, store.archetypes.Bullet);
  if (bullet !== null) return { position: bullet.position, velocity: bullet.velocity, age: bullet.age };
  const asteroid = store.read(entity, store.archetypes.Asteroid);
  if (asteroid !== null) return { position: asteroid.position, velocity: asteroid.velocity, size: asteroid.size };
  throw new Error("conformance projection: entity is not a ship, bullet, or asteroid");
};
