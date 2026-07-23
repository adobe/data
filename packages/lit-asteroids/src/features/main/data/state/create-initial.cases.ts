// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import type { Vec2 } from "@adobe/data/math";

// Spec-owned `{ before, args, after }` cases for `State.createInitial`
// (args = the play-field bounds), shared with the ecs `newGame` transaction.
// `createInitial` ignores `before` entirely — it produces a fresh game from the
// bounds alone — so `before` here is a deliberately dirty state, which also
// proves `newGame` clears whatever was there. A fresh game centres the ship,
// resets score/lives/wave, and spawns wave 1 (asteroidsFor(1)=4 large in a
// clean quadrant ring at radius min(bounds)·0.4), so every `after` is exact.
const dirty: State = {
  bounds: [1, 1],
  ship: { position: [10, 10], velocity: [5, 5], rotation: 1 },
  bullets: [{ position: [1, 1], velocity: [0, 0], age: 0.5 }],
  asteroids: [{ position: [9, 9], velocity: [0, 0], size: "small" }],
  score: 99,
  lives: 1,
  wave: 7,
};

export const cases: readonly ConformanceCase<Vec2>[] = [
  {
    name: "starts a fresh 200×200 game: centred ship, first wave, reset counters",
    before: dirty,
    args: [200, 200],
    after: {
      bounds: [200, 200],
      ship: { position: [100, 100], velocity: [0, 0], rotation: -Math.PI / 2 },
      bullets: [],
      asteroids: [
        { position: [180, 100], velocity: [0, 60], size: "large" },
        { position: [100, 180], velocity: [-60, 0], size: "large" },
        { position: [20, 100], velocity: [0, -60], size: "large" },
        { position: [100, 20], velocity: [60, 0], size: "large" },
      ],
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
  {
    name: "starts a fresh 400×400 game with the ring scaled to the field",
    before: dirty,
    args: [400, 400],
    after: {
      bounds: [400, 400],
      ship: { position: [200, 200], velocity: [0, 0], rotation: -Math.PI / 2 },
      bullets: [],
      asteroids: [
        { position: [360, 200], velocity: [0, 60], size: "large" },
        { position: [200, 360], velocity: [-60, 0], size: "large" },
        { position: [40, 200], velocity: [0, -60], size: "large" },
        { position: [200, 40], velocity: [60, 0], size: "large" },
      ],
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
];
