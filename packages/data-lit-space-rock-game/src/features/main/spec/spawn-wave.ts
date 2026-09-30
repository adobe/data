// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Asteroid } from "../data/values/asteroid/asteroid.js";
import { Wave } from "../data/values/wave/wave.js";

// When the field is clear, advance to the next wave: a ring of large asteroids
// drifting at the fixed base speed. Deterministic — this seeds the FIRST wave
// (`createInitial`), so a fresh game always starts from the same fair layout.
// A no-op while asteroids remain.
export const spawnWave = (
  state: Pick<State, "entities" | "wave" | "bounds">,
): Pick<State, "entities" | "wave"> => {
  const hasAsteroid = [...state.entities.values()].some((v) => Asteroid.is(v));
  if (hasAsteroid) {
    return { entities: state.entities, wave: state.wave };
  }
  const wave = state.wave + 1;
  const entities = new Map(state.entities);
  let nextId = Math.max(0, ...state.entities.keys()) + 1;
  for (const asteroid of Wave.ring(state.bounds, wave, () => Wave.speed)) {
    entities.set(nextId++, asteroid);
  }
  return { wave, entities };
};
