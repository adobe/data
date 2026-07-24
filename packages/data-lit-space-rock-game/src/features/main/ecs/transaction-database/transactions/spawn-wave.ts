// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { readAsteroids } from "./read-asteroids.js";

// Advance to the next wave. Thin wrapper over State.spawnWave: project the
// {asteroids, wave, bounds} slice, let the data/ transform decide the count and
// ring layout, then bump `wave` and insert the spawned rocks. The transform is
// a no-op while the field still has asteroids (returns the same object), so
// dispatching mid-wave changes nothing.
export const spawnWave = (t: CoreDatabase.Store): void => {
  const before = {
    asteroids: readAsteroids(t),
    wave: t.resources.wave,
    bounds: t.resources.bounds,
  };
  const after = State.spawnWave(before);
  if (after === before) return;
  t.resources.wave = after.wave;
  for (const asteroid of after.asteroids) {
    t.archetypes.Asteroid.insert(asteroid);
  }
};
