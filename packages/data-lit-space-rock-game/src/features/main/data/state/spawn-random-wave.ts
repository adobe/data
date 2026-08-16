// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
import { Asteroid } from "../asteroid/asteroid.js";
import { Size } from "../size/size.js";
import { Motion } from "../motion/motion.js";
import { RandomService } from "../../services/random-service/random-service.js";
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

// Spec-owned cases, shared with the ecs `spawnRandomWave` transaction. Each case
// injects its own fixed random sequence and authors `after` against it — the same
// double flows to both sides, so the randomized velocities are exact and the two
// sides agree: conformance stays honest even though the transition draws
// randomness. `next` is a value-returning read (not a fire-and-forget side
// effect), so it is NOT declared in `effects`.
//
// The injected sequence has length 4 and a spawn draws exactly 4 values (one per
// asteroid at `asteroidsFor(1) = 4`). Field 200×200 → centre [100,100], ring
// radius 80; positions match `spawnWave`, only drift SPEED is jittered:
// `speed(i) = 60·(0.5 + sequence[i])` → [30, 60, 45, 75] in ring order.
const field = { ...create(), bounds: [200, 200] as [number, number] };
const randoms = [0, 0.5, 0.25, 0.75];

export const cases: Conformance<typeof spawnRandomWave> = [
  {
    name: "spawns a randomized wave (jittered drift speeds) when the field is clear",
    before: { ...field, entities: new Map(), wave: 0 },
    args: { random: RandomService.createFake(randoms) },
    after: {
      ...field,
      wave: 1,
      entities: new Map([
        [1, { position: [180, 100], velocity: [0, 30], size: "large" }],
        [2, { position: [100, 180], velocity: [-60, 0], size: "large" }],
        [3, { position: [20, 100], velocity: [0, -45], size: "large" }],
        [4, { position: [100, 20], velocity: [75, 0], size: "large" }],
      ]),
    },
  },
  {
    name: "does nothing while asteroids still remain",
    before: {
      ...field,
      wave: 1,
      entities: new Map([
        [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
      ]),
    },
    args: { random: RandomService.createFake(randoms) },
    after: {
      ...field,
      wave: 1,
      entities: new Map([
        [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
      ]),
    },
  },
];
