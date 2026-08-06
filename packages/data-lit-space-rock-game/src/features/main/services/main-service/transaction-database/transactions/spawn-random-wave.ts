// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import type { CoreDatabase } from "../../core-database/core-database.js";
import { RandomService } from "../../../random-service/random-service.js";
import { readAsteroids } from "./read-asteroids.js";

// Advance to the next wave with a randomized layout. Thin wrapper over
// State.spawnRandomWave: project the {asteroids, wave, bounds} slice, let the
// data/ transform decide the count and per-rock drift with the INJECTED `random`
// service, then bump `wave` and insert the spawned rocks. The transform is a
// no-op while the field still has asteroids (returns the same object), so
// dispatching mid-wave changes nothing. The `waves` system supplies the real
// random source; tests inject RandomService.createFake for exact assertions.
export const spawnRandomWave = (
  t: CoreDatabase.Store,
  { random }: { random: RandomService },
): void => {
  const before = {
    asteroids: readAsteroids(t),
    wave: t.resources.wave,
    bounds: t.resources.bounds,
  };
  const after = State.spawnRandomWave(before, { random });
  if (after === before) return;
  t.resources.wave = after.wave;
  for (const asteroid of after.asteroids) {
    t.archetypes.Asteroid.insert(asteroid);
  }
};
