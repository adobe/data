// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import { Conformance } from "./conformance-case.js";
import { Input } from "../input/input.js";
import { Ship } from "../ship/ship.js";
import { stepShip } from "./step-ship.js";
import { fireBullet } from "./fire-bullet.js";
import { stepBullets } from "./step-bullets.js";
import { stepAsteroids } from "./step-asteroids.js";
import { resolveBulletHits } from "./resolve-bullet-hits.js";
import { resolveShipHits } from "./resolve-ship-hits.js";
import { spawnRandomWave } from "./spawn-random-wave.js";
import { isGameOver } from "./is-game-over.js";
import { RandomService } from "../../services/random-service/random-service.js";
import type { Services } from "../../services/services.js";

// Advance the whole game one tick. This is the authoritative spec the ECS systems
// are verified against: move the ship, fire, advance bullets and asteroids,
// resolve collisions, then refill the wave if the field is clear. A game that is
// over is frozen (idempotent). `dt`, `input`, and the injected `random` service
// are bundled into one args object (second parameter) so the co-located
// conformance cases derive their `args` type from this signature.
//
// The refill draws randomness, so `step` threads the injected `random` service
// down to `spawnRandomWave` — keeping the whole tick deterministic GIVEN the
// service. The runtime ECS `waves` system supplies a real `Math.random`-backed
// source; because that source cannot be shared with the pure oracle
// frame-for-frame, the shared tick-loop conformance cases never clear the field
// (the randomized refill is exercised directly in `spawn-random-wave.ts` cases and
// conformed via the `spawnRandomWave` transaction).
export const step = (
  state: State,
  {
    dt,
    input,
    random,
  }: {
    readonly dt: number;
    readonly input: Input;
  } & Pick<Services, "random">,
): State => {
  if (isGameOver(state)) {
    return state;
  }
  // Each sub-transition returns only the fields it writes; layer each patch over
  // the running full state so the whole tick composes into one State.
  let next: State = { ...state, ...stepShip(state, { dt, input }) };
  if (input.fire) {
    next = { ...next, ...fireBullet(next) };
  }
  next = { ...next, ...stepBullets(next, dt) };
  next = { ...next, ...stepAsteroids(next, dt) };
  next = { ...next, ...resolveBulletHits(next, dt) };
  next = { ...next, ...resolveShipHits(next) };
  next = { ...next, ...spawnRandomWave(next, { random }) };
  return next;
};

// Spec-owned cases for the whole-tick `step`, shared with the ecs system tick-loop
// conformance (one frame = one step). Each case exercises one branch of the step
// pipeline — advance/wrap, fire, bullet↔asteroid resolution, ship↔asteroid
// resolution, and the game-over freeze — with geometry chosen so every `after` is
// exact. NONE clears the field, so `random` is never drawn (a fresh double per
// case satisfies the signature without affecting the outcome); the randomized
// refill is conformed out-of-band via the `spawnRandomWave` transaction.
export const cases = /*@__PURE__*/ Conformance.cases(step,
  {
    name: "advances and wraps every body (movement)",
    before: {
      bounds: [200, 200],
      ship: { position: [190, 100], velocity: [30, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [190, 180], velocity: [30, 30], size: "large" }],
      ]),
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: { dt: 1, input: Input.none, random: RandomService.createFake() },
    after: {
      bounds: [200, 200],
      ship: { position: [20, 100], velocity: [30, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [20, 10], velocity: [30, 30], size: "large" }],
      ]),
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
  {
    name: "fires from the post-move muzzle and advances the new bullet (lifetime)",
    before: {
      bounds: [400, 400],
      ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [350, 350], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: {
      dt: 0.1,
      input: { turn: 0, thrust: false, fire: true },
      random: RandomService.createFake(),
    },
    after: {
      bounds: [400, 400],
      ship: { position: [100, 100], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [152, 100], velocity: [400, 0], age: 0.1 }],
        [2, { position: [350, 350], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
  {
    name: "resolves a bullet↔asteroid hit (split + score)",
    before: {
      bounds: [800, 600],
      ship: { position: [700, 500], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [100, 100], velocity: [0, 0], age: 0 }],
        [2, { position: [100, 100], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: { dt: 0.1, input: Input.none, random: RandomService.createFake() },
    after: {
      bounds: [800, 600],
      ship: { position: [700, 500], velocity: [0, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [100, 100], velocity: [0, 0], size: "medium" }],
        [2, { position: [100, 100], velocity: [0, 0], size: "medium" }],
      ]),
      score: 20,
      lives: 3,
      wave: 1,
    },
  },
  {
    name: "resolves a ship↔asteroid hit (lose a life, respawn at centre)",
    before: {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      entities: new Map([
        [1, { position: [100, 100], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
      lives: 3,
      wave: 1,
    },
    args: { dt: 0.1, input: Input.none, random: RandomService.createFake() },
    after: {
      bounds: [200, 200],
      ship: Ship.spawn([100, 100]),
      entities: new Map([
        [1, { position: [100, 100], velocity: [0, 0], size: "large" }],
      ]),
      score: 0,
      lives: 2,
      wave: 1,
    },
  },
  {
    name: "freezes the whole tick once the game is over",
    before: {
      bounds: [200, 200],
      ship: { position: [50, 50], velocity: [10, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [60, 60], velocity: [0, 0], age: 0.5 }],
        [2, { position: [100, 100], velocity: [0, 0], size: "large" }],
      ]),
      score: 40,
      lives: 0,
      wave: 2,
    },
    args: {
      dt: 0.1,
      input: { turn: 1, thrust: true, fire: true },
      random: RandomService.createFake(),
    },
    after: {
      bounds: [200, 200],
      ship: { position: [50, 50], velocity: [10, 0], rotation: 0 },
      entities: new Map([
        [1, { position: [60, 60], velocity: [0, 0], age: 0.5 }],
        [2, { position: [100, 100], velocity: [0, 0], size: "large" }],
      ]),
      score: 40,
      lives: 0,
      wave: 2,
    },
  },
);
