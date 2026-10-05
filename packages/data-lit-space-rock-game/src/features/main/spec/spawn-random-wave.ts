// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Asteroid } from "../data/values/asteroid/asteroid.js";
import { Wave } from "../data/values/wave/wave.js";
import type { Services } from "../services/services.js";

/**
 * The randomized sibling of {@link spawnWave}: same ring layout, but each rock's
 * drift speed is `Wave.speed · (0.5 + random.next())`, i.e. `[0.5×, 1.5×)`, drawing
 * one value per asteroid in ring order. Deterministic given the injected `random`
 * service. A no-op while asteroids remain (draws nothing).
 */
export const spawnRandomWave = (
  state: Pick<State, "entities" | "wave" | "bounds">,
  { random }: Pick<Services, "random">,
): Pick<State, "entities" | "wave"> => {
  const hasAsteroid = [...state.entities.values()].some((v) => Asteroid.is(v));
  if (hasAsteroid) {
    return { entities: state.entities, wave: state.wave };
  }
  const wave = state.wave + 1;
  const entities = new Map(state.entities);
  let nextId = Math.max(0, ...state.entities.keys()) + 1;
  for (const asteroid of Wave.ring(state.bounds, wave, () => Wave.speed * (0.5 + random.next()))) {
    entities.set(nextId++, asteroid);
  }
  return { wave, entities };
};
