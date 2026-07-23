// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import { Asteroid } from "../../../data/asteroid/asteroid.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// The outcome of a bullet striking an asteroid, dispatched by the collision
// system. Mirrors one iteration of State.resolveBulletHits: remove the bullet
// and the struck asteroid, award the asteroid's score, and insert its split
// children (the smallest tier yields none, so it just vanishes). A missing
// asteroid (already resolved earlier this frame) is a no-op.
export const hitAsteroid = (
  t: CoreDatabase.Store,
  { bullet, asteroid }: { readonly bullet: Entity; readonly asteroid: Entity },
): void => {
  const row = t.read(asteroid, t.archetypes.Asteroid);
  if (row === null) return;
  const target: Asteroid = {
    position: row.position,
    velocity: row.velocity,
    size: row.size,
  };
  t.delete(bullet);
  t.delete(asteroid);
  t.resources.score = t.resources.score + Asteroid.score(target);
  for (const child of Asteroid.split(target)) {
    t.archetypes.Asteroid.insert(child);
  }
};
