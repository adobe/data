// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Size } from "../size/size.js";
import { Motion } from "../motion/motion.js";
import type { Services } from "../../services/services.js";

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
export const spawnRandomWave = (
  state: Pick<State, "entities" | "wave" | "bounds">,
  { random }: Pick<Services, "random">,
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
    const speed = waveSpeed * (0.5 + random.next());
    entities.set(nextId++, {
      position: Vec2.add(center, Vec2.scale(outward, ring)),
      velocity: Vec2.scale(tangent, speed),
      size: Size.largest,
    });
  }
  return { wave, entities };
};
