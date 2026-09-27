// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Size } from "../size/size.js";
import { Motion } from "../motion/motion.js";

// Drift speed of freshly-spawned asteroids.
const waveSpeed = 60;
// Each cleared wave spawns this many more rocks than the last.
const asteroidsFor = (wave: number): number => 3 + wave;

// When the field is clear, advance to the next wave: spawn a ring of large
// asteroids around the centre (clear of the ship's spawn), each drifting
// tangentially at a fixed speed. Deterministic — this seeds the FIRST wave
// (`createInitial`, so a fresh game always starts from the same fair layout).
// The randomized sibling `spawnRandomWave` injects a `random` service for the
// varied refill waves the tick loop spawns.
export const spawnWave = (
  state: Pick<State, "entities" | "wave" | "bounds">,
): Pick<State, "entities" | "wave"> => {
  const hasAsteroid = [...state.entities.values()].some((v) => Asteroid.is(v));
  if (hasAsteroid) {
    return { entities: state.entities, wave: state.wave };
  }
  const wave = state.wave + 1;
  const count = asteroidsFor(wave);
  const center = Vec2.scale(state.bounds, 0.5);
  const ring = Math.min(state.bounds[0], state.bounds[1]) * 0.4;
  const entities = new Map(state.entities);
  let nextId = Math.max(0, ...state.entities.keys()) + 1;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const outward = Motion.rotate([1, 0], angle);
    const tangent = Motion.rotate([1, 0], angle + Math.PI / 2);
    entities.set(nextId++, {
      position: Vec2.add(center, Vec2.scale(outward, ring)),
      velocity: Vec2.scale(tangent, waveSpeed),
      size: Size.largest,
    });
  }
  return { wave, entities };
};
