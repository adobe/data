// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { step } from "./step.js";
import { Input } from "../input/input.js";
import { Ship } from "../ship/ship.js";

// Inert, spec-owned cases for the whole-tick `step` (args is `{ dt, input }`; the
// injected `random` port is stripped from the case args and synthesized by the
// runner from the manifest's `services` template). `step` has no ecs transaction —
// the per-frame system loop conforms it in `system-database/tick-loop.test.ts`
// (see systems.md), which also reads these cases — so `checkFeature` skips it while
// the pure `checkSpec` verifies it here.
//
// Each case exercises one branch of the step pipeline — advance/wrap, fire,
// bullet↔asteroid resolution, ship↔asteroid resolution, and the game-over freeze —
// with geometry chosen so every `after` is exact. NONE clears the field, so `random`
// is never drawn; the randomized refill is conformed out-of-band via the
// `spawnRandomWave` cases.
export const cases: Conformance.SpecCases<State, typeof step> = {
  cases: [
    {
      name: "advances and wraps every body (movement)",
      before: {
        bounds: [200, 200],
        ship: { position: [190, 100], velocity: [30, 0], rotation: 0 },
        entities: new Map([[1, { position: [190, 180], velocity: [30, 30], size: "large" }]]),
        score: 0,
        lives: 3,
        wave: 1,
      },
      args: { dt: 1, input: Input.none },
      after: {
        bounds: [200, 200],
        ship: { position: [20, 100], velocity: [30, 0], rotation: 0 },
        entities: new Map([[1, { position: [20, 10], velocity: [30, 30], size: "large" }]]),
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
        entities: new Map([[1, { position: [350, 350], velocity: [0, 0], size: "large" }]]),
        score: 0,
        lives: 3,
        wave: 1,
      },
      args: { dt: 0.1, input: { turn: 0, thrust: false, fire: true } },
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
      args: { dt: 0.1, input: Input.none },
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
        entities: new Map([[1, { position: [100, 100], velocity: [0, 0], size: "large" }]]),
        score: 0,
        lives: 3,
        wave: 1,
      },
      args: { dt: 0.1, input: Input.none },
      after: {
        bounds: [200, 200],
        ship: Ship.spawn([100, 100]),
        entities: new Map([[1, { position: [100, 100], velocity: [0, 0], size: "large" }]]),
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
      args: { dt: 0.1, input: { turn: 1, thrust: true, fire: true } },
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
  ],
};
