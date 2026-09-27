// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { newGame } from "./new-game.js";
import { create } from "./create.js";

// Inert, spec-owned cases, shared with the ecs `newGame` transaction. `before` is a
// fully-divergent mid-run state (dimensions, terrain, hazards, frog, lives, score,
// status all differ) so the reset is proven total. `after` is just the initial game
// (`create()`): its hazard-entity keys are plain spec-ids that conformance compares
// up to an id-bijection, so the ecs is free to mint its own. `newGame` takes no
// args (it ignores the prior state).
export const cases: Conformance.SpecCases<State, typeof newGame> = {
  cases: [
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
      after: create(),
    },
  ],
};
