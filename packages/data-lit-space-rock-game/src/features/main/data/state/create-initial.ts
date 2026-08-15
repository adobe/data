// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { Ship } from "../ship/ship.js";
import { spawnWave } from "./spawn-wave.js";

// A fresh game for a `bounds`-sized field: ship centred, no bullets, three lives,
// zero score, and the first wave of asteroids spawned in. This is a "new game"
// TRANSITION — it produces a fresh game from the `bounds` alone and deliberately
// **ignores** the prior `state` (a reset), which is exactly what the ecs `newGame`
// transaction it maps to does (it clears whatever was there). The prior state is
// still the transition's first parameter so it fits the `(state, args) => state`
// shape the co-located conformance cases derive their `args` type from.
export const createInitial = (
  _state: State,
  { bounds }: { readonly bounds: Vec2 },
): State => {
  const fresh: State = {
    bounds,
    ship: Ship.spawn(Vec2.scale(bounds, 0.5)),
    entities: new Map(),
    score: 0,
    lives: 3,
    wave: 0,
  };
  // spawnWave returns only { entities, wave }; layer it over the fresh game.
  return { ...fresh, ...spawnWave(fresh) };
};

// Spec-owned cases, shared with the ecs `newGame` transaction. `createInitial`
// ignores `before` entirely — it produces a fresh game from the bounds alone — so
// `before` here is a deliberately dirty state, which also proves `newGame` clears
// whatever was there. A fresh game centres the ship, resets score/lives/wave, and
// spawns wave 1 (asteroidsFor(1)=4 large in a clean quadrant ring at radius
// min(bounds)·0.4), so every `after` is exact.
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

export const cases: Conformance<typeof createInitial> = [
  {
    name: "starts a fresh 200×200 game: centred ship, first wave, reset counters",
    before: dirty,
    args: { bounds: [200, 200] },
    after: {
      bounds: [200, 200],
      ship: { position: [100, 100], velocity: [0, 0], rotation: -Math.PI / 2 },
      entities: new Map([
        [Match.ref("a1"), { position: [180, 100], velocity: [0, 60], size: "large" }],
        [Match.ref("a2"), { position: [100, 180], velocity: [-60, 0], size: "large" }],
        [Match.ref("a3"), { position: [20, 100], velocity: [0, -60], size: "large" }],
        [Match.ref("a4"), { position: [100, 20], velocity: [60, 0], size: "large" }],
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
        [Match.ref("a1"), { position: [360, 200], velocity: [0, 60], size: "large" }],
        [Match.ref("a2"), { position: [200, 360], velocity: [-60, 0], size: "large" }],
        [Match.ref("a3"), { position: [40, 200], velocity: [0, -60], size: "large" }],
        [Match.ref("a4"), { position: [200, 40], velocity: [60, 0], size: "large" }],
      ]),
      score: 0,
      lives: 3,
      wave: 1,
    },
  },
];
