// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";
import { create } from "./create.js";
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

// Spec-owned cases for the deterministic `spawnWave` (no args) — the fixed FIRST
// wave `createInitial` seeds (its randomized refill sibling is `spawnRandomWave`).
// When the field is clear it bumps the wave and spawns a ring of large asteroids
// around the centre, each drifting tangentially at 60px/s; while asteroids remain
// it is a no-op. Field 200×200 → centre [100,100], ring radius 80. From wave 0 the
// count is asteroidsFor(1)=4, so the ring lands on the four clean quadrant angles.
const field = { ...create(), bounds: [200, 200] as [number, number] };

export const cases = /*@__PURE__*/ Conformance.cases(spawnWave,
  {
    name: "spawns the next wave of large asteroids when the field is clear",
    before: { ...field, entities: new Map(), wave: 0 },
    args: undefined,
    after: {
      ...field,
      wave: 1,
      entities: new Map([
        [1, { position: [180, 100], velocity: [0, 60], size: "large" }],
        [2, { position: [100, 180], velocity: [-60, 0], size: "large" }],
        [3, { position: [20, 100], velocity: [0, -60], size: "large" }],
        [4, { position: [100, 20], velocity: [60, 0], size: "large" }],
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
    args: undefined,
    after: {
      ...field,
      wave: 1,
      entities: new Map([
        [1, { position: [10, 10], velocity: [0, 0], size: "large" }],
      ]),
    },
  },
);
