// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import type { Asteroid } from "../asteroid/asteroid.js";
import { Size } from "../size/size.js";
import { Motion } from "../motion/motion.js";
import { RandomService } from "../../services/random-service/random-service.js";

// Base drift speed; each rock's actual speed is jittered around it.
const waveSpeed = 60;
// Each cleared wave spawns this many more rocks than the last.
const asteroidsFor = (wave: number): number => 3 + wave;

/**
 * The randomized sibling of {@link spawnWave} (the todo `createRandomTodo` ↔
 * `createTodo` split): it takes an **injected `random` service** — keyed by the
 * service name minus its `-service` suffix (`state.md`) — so the per-asteroid
 * variation cannot be computed from `state` alone. Still **deterministic given
 * the service**: inject a fixed sequence and the wave is fixed, which is how it
 * is unit-tested and how the ECS `spawnRandomWave` transaction conforms to it.
 *
 * The ring layout (angles/positions) matches `spawnWave` exactly; only each
 * rock's drift SPEED is scaled — `waveSpeed · (0.5 + random.next())`, i.e.
 * `[0.5×, 1.5×)` — drawing one value per asteroid in ring order. A no-op while
 * asteroids remain (draws nothing, returns the same reference).
 */
export const spawnRandomWave = <T extends Pick<State, "asteroids" | "wave" | "bounds">>(
  state: T,
  { random }: { random: RandomService },
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
    const speed = waveSpeed * (0.5 + random.next());
    asteroids.push({
      position: Vec2.add(center, Vec2.scale(outward, ring)),
      velocity: Vec2.scale(tangent, speed),
      size: Size.largest,
    });
  }
  return { ...state, wave, asteroids };
};
