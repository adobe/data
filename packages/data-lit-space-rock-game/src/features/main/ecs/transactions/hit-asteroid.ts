// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { Asteroid } from "../../data/values/asteroid/asteroid.js";
import type { CoreDatabase } from "../core/core-database.js";

// A bullet struck an asteroid (dispatched by the collision system): remove both,
// award the asteroid's score, and insert its split children. A missing asteroid
// (already resolved this frame) is a no-op.
export const hitAsteroid = (
  t: CoreDatabase.Store,
  { bullet, asteroid }: { readonly bullet: Entity; readonly asteroid: Entity },
): void => {
  const row = t.read(asteroid, t.archetypes.Asteroid);
  if (row === null) return;
  const target: Asteroid = { position: row.position, velocity: row.velocity, size: row.size };
  t.delete(bullet);
  t.delete(asteroid);
  t.resources.score = t.resources.score + Asteroid.score(target);
  for (const child of Asteroid.split(target)) t.archetypes.Asteroid.insert(child);
};
