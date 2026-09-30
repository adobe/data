// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "../../spec/state.js";
import type * as systems from "../../spec/systems.js";
import { Input } from "../../data/values/input/input.js";
import { Ship } from "../../data/values/ship/ship.js";

// Whole-frame cases: every system once, in the order their `schedule`s declare. Each
// exercises one hand-off between systems with geometry chosen so every `after` is
// exact. Three only hold in that order: thrust (`control`) before the coast
// (`movement`), the ship's move before it fires (`lifetime`), and the last hit
// (`collision`) before the refill (`waves`).
export const cases: Conformance.FrameCases<State, typeof systems> = {
  cases: [
    {
      // Thrust first: velocity [20,0], then the coast moves 2px (coasting first gives 0).
      name: "thrusts, then coasts by the new velocity",
      before: {
        bounds: [200, 200],
        ship: { position: [50, 50], velocity: [0, 0], rotation: 0 },
        entities: new Map([[1, { position: [150, 150], velocity: [0, 0], size: "large" }]]),
        wave: 1,
      },
      args: { dt: 0.1, input: { turn: 0, thrust: true, fire: false } },
      after: { ship: { position: [52, 50], velocity: [20, 0], rotation: 0 } },
    },
    {
      name: "advances and wraps every body",
      before: {
        bounds: [200, 200],
        ship: { position: [190, 100], velocity: [30, 0], rotation: 0 },
        entities: new Map([[1, { position: [190, 180], velocity: [30, 30], size: "large" }]]),
        wave: 1,
      },
      args: { dt: 1, input: Input.none },
      after: {
        ship: { position: [20, 100], velocity: [30, 0], rotation: 0 },
        entities: new Map([[1, { position: [20, 10], velocity: [30, 30], size: "large" }]]),
      },
    },
    {
      // The ship moves to [110,100] first, so the bullet leaves [122,100] at
      // 100 + 400 px/s and advances to [172,100] (firing before the move gives [162,100]).
      name: "fires from the post-move muzzle and advances the new bullet",
      before: {
        bounds: [400, 400],
        ship: { position: [100, 100], velocity: [100, 0], rotation: 0 },
        entities: new Map([[1, { position: [350, 350], velocity: [0, 0], size: "large" }]]),
        wave: 1,
      },
      args: { dt: 0.1, input: { turn: 0, thrust: false, fire: true } },
      after: {
        ship: { position: [110, 100], velocity: [100, 0], rotation: 0 },
        entities: new Map([
          [1, { position: [172, 100], velocity: [500, 0], age: 0.1 }],
          [2, { position: [350, 350], velocity: [0, 0], size: "large" }],
        ]),
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
        wave: 1,
      },
      args: { dt: 0.1, input: Input.none },
      after: {
        entities: new Map([
          [1, { position: [100, 100], velocity: [0, 0], size: "medium" }],
          [2, { position: [100, 100], velocity: [0, 0], size: "medium" }],
        ]),
        score: 20,
      },
    },
    {
      name: "resolves a ship↔asteroid hit (lose a life, respawn at centre)",
      before: {
        bounds: [200, 200],
        ship: Ship.spawn([100, 100]),
        entities: new Map([[1, { position: [100, 100], velocity: [0, 0], size: "large" }]]),
        wave: 1,
      },
      args: { dt: 0.1, input: Input.none },
      after: { lives: 2 },
    },
    {
      name: "freezes the whole frame once the game is over",
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
      after: {},
    },
    {
      // `collision` clears the field before `waves` looks, so it refills this frame.
      name: "shooting the last asteroid refills the field the same frame",
      before: {
        bounds: [200, 200],
        ship: Ship.spawn([100, 100]),
        entities: new Map([
          [1, { position: [30, 30], velocity: [0, 0], age: 0 }],
          [2, { position: [30, 30], velocity: [0, 0], size: "small" }],
        ]),
        wave: 0,
      },
      args: { dt: 0.1, input: Input.none },
      responses: { random: { next: [0, 0.5, 0.25, 0.75] } },
      after: {
        score: 100,
        wave: 1,
        entities: new Map([
          [1, { position: [180, 100], velocity: [0, 30], size: "large" }],
          [2, { position: [100, 180], velocity: [-60, 0], size: "large" }],
          [3, { position: [20, 100], velocity: [0, -45], size: "large" }],
          [4, { position: [100, 20], velocity: [75, 0], size: "large" }],
        ]),
      },
    },
  ],
};
