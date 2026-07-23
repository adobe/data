// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import type { Asteroid } from "../asteroid/asteroid.js";
import { Size } from "../size/size.js";
import { Motion } from "../motion/motion.js";

// Drift speed of freshly-spawned asteroids.
const waveSpeed = 60;
// Each cleared wave spawns this many more rocks than the last.
const asteroidsFor = (wave: number): number => 3 + wave;

// When the field is clear, advance to the next wave: spawn a ring of large
// asteroids around the centre (clear of the ship's spawn), each drifting
// tangentially. Deterministic — the ECS layer may randomise; the spec does not.
export const spawnWave = <T extends Pick<State, "asteroids" | "wave" | "bounds">>(
  state: T,
): T => {
  if (state.asteroids.length > 0) {
    return state;
  }
  const wave = state.wave + 1;
  const count = asteroidsFor(wave);
  const center = Vec2.scale(state.bounds, 0.5);
  const ring = Math.min(state.bounds[0], state.bounds[1]) * 0.4;
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const outward = Motion.rotate([1, 0], angle);
    const tangent = Motion.rotate([1, 0], angle + Math.PI / 2);
    asteroids.push({
      position: Vec2.add(center, Vec2.scale(outward, ring)),
      velocity: Vec2.scale(tangent, waveSpeed),
      size: Size.largest,
    });
  }
  return { ...state, wave, asteroids };
};
