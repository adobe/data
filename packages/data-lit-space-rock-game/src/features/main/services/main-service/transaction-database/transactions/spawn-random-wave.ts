// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "../../../../data/state/state.js";
import { Asteroid } from "../../../../data/asteroid/asteroid.js";
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
  // spawnRandomWave is a no-op while the field still has asteroids; guard here so
  // a mid-wave dispatch inserts nothing (the patch return is a fresh object, so it
  // can no longer be reference-compared to detect the no-op).
  if (readAsteroids(t).length > 0) return;
  const after = State.spawnRandomWave(
    { entities: new Map(), wave: t.resources.wave, bounds: t.resources.bounds },
    { random },
  );
  t.resources.wave = after.wave;
  // The seed's entities were empty, so the patch holds exactly the spawned rocks.
  for (const value of after.entities.values()) {
    if (Asteroid.is(value)) t.archetypes.Asteroid.insert(value);
  }
};
