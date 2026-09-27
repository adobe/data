// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { createInitial } from "./create-initial.js";

// Inert, spec-owned cases, shared with the ecs `createInitial` transaction.
// `createInitial` ignores `before` entirely — it produces a fresh game from the
// bounds alone — so `before` here is a deliberately dirty state, which also proves
// the transaction clears whatever was there. A fresh game centres the ship, resets
// score/lives/wave, and spawns wave 1 (asteroidsFor(1)=4 large in a clean quadrant
// ring at radius min(bounds)·0.4), so every `after` is exact. `bounds` is plain
// data — no service double, no entity refs.
const dirty: State = {
  bounds: [1, 1],
  ship: { position: [10, 10], velocity: [5, 5], rotation: 1 },
  entities: new Map([
    [1, { position: [1, 1], velocity: [0, 0], age: 0.5 }],
    [2, { position: [9, 9], velocity: [0, 0], size: "small" }],
  ]),
  score: 99,
  lives: 1,
  wave: 7,
};

export const cases: Conformance.SpecCases<State, typeof createInitial> = {
  cases: [
    {
      name: "starts a fresh 200×200 game: centred ship, first wave, reset counters",
      before: dirty,
      args: { bounds: [200, 200] },
      after: {
        bounds: [200, 200],
        ship: { position: [100, 100], velocity: [0, 0], rotation: -Math.PI / 2 },
        entities: new Map([
          [1, { position: [180, 100], velocity: [0, 60], size: "large" }],
          [2, { position: [100, 180], velocity: [-60, 0], size: "large" }],
          [3, { position: [20, 100], velocity: [0, -60], size: "large" }],
          [4, { position: [100, 20], velocity: [60, 0], size: "large" }],
        ]),
        score: 0,
        lives: 3,
        wave: 1,
      },
    },
    {
      name: "starts a fresh 400×400 game with the ring scaled to the field",
      before: dirty,
      args: { bounds: [400, 400] },
      after: {
        bounds: [400, 400],
        ship: { position: [200, 200], velocity: [0, 0], rotation: -Math.PI / 2 },
        entities: new Map([
          [1, { position: [360, 200], velocity: [0, 60], size: "large" }],
          [2, { position: [200, 360], velocity: [-60, 0], size: "large" }],
          [3, { position: [40, 200], velocity: [0, -60], size: "large" }],
          [4, { position: [200, 40], velocity: [60, 0], size: "large" }],
        ]),
        score: 0,
        lives: 3,
        wave: 1,
      },
    },
  ],
};
