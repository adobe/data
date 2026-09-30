// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Wave } from "../../data/values/wave/wave.js";
import type { CoreDatabase } from "../core/core-database.js";

// When the field is clear, bump `wave` and insert its ring of asteroids, each
// drifting at `speedOf()`. A no-op while any asteroid remains.
export const nextWave = (t: CoreDatabase.Store, speedOf: () => number): void => {
  for (const arch of t.queryArchetypes(t.archetypes.Asteroid.components)) {
    if (arch.rowCount > 0) return;
  }
  const wave = t.resources.wave + 1;
  t.resources.wave = wave;
  for (const asteroid of Wave.ring(t.resources.bounds, wave, speedOf)) {
    t.archetypes.Asteroid.insert(asteroid);
  }
};
