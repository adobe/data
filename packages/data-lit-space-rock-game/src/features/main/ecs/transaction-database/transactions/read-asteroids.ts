// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Asteroid } from "../../../data/asteroid/asteroid.js";
import type { CoreDatabase } from "../../core-database/core-database.js";

// The current asteroids projected back to their data/ values — the slice
// State.spawnWave reads to decide whether the field is clear. Only the Asteroid
// archetype carries `size`, so the query matches it alone.
export const readAsteroids = (t: CoreDatabase.Store): Asteroid[] => {
  const asteroids: Asteroid[] = [];
  for (const arch of t.queryArchetypes(t.archetypes.Asteroid.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      asteroids.push({
        position: arch.columns.position.get(row),
        velocity: arch.columns.velocity.get(row),
        size: arch.columns.size.get(row),
      });
    }
  }
  return asteroids;
};
