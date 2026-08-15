// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Match } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";
import { create } from "./create.js";

// A "new game" TRANSITION: it deliberately **ignores** the prior `state` and
// produces the initial game (see `create`), which is exactly what the ecs
// `newGame` transaction it maps to does (it clears whatever was there). The prior
// state is still the first parameter so it fits the `(state, args) => state` shape
// the co-located conformance cases derive from.
export const newGame = (_state: State): State => create();

// The initial game with its hazard-entity keys left OPEN: the ecs `newGame`
// transaction mints its own ids, so `after` must not pin the concrete keys
// `create()` uses (a distinct `Match.ref` per hazard, injective) — see conformance.md.
const initial = create();
const initialWithOpenKeys: State = {
  ...initial,
  entities: new Map(
    [...initial.entities.values()].map((hazard, index) => [Match.ref(`hazard-${index}`), hazard]),
  ),
};

// Spec-owned cases, shared with the ecs `newGame` transaction. `before` is a
// fully-divergent mid-run state (dimensions, terrain, hazards, frog, lives, score,
// status all differ) so the reset is proven total.
export const cases: Conformance<typeof newGame> = [
  {
    name: "resets a mid-game store to the initial game",
    before: {
      width: 3,
      height: 3,
      lanes: [
        { row: 0, kind: "grass" },
        { row: 1, kind: "river" },
        { row: 2, kind: "goal" },
      ],
      entities: new Map([[1, { kind: "log", lane: 1, x: 0, width: 2, velocity: 1 }]]),
      frog: { x: 1, y: 2 },
      lives: 0,
      score: 7,
      status: "gameOver",
    },
    after: initialWithOpenKeys,
  },
];
