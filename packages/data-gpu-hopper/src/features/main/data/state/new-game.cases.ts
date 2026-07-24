// © 2026 Adobe. MIT License. See /LICENSE for details.
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";

// `newGame` ignores the prior state and resets to `State.create()`. The `before`
// here differs in every field (dimensions, terrain, hazards, frog, lives, score,
// status) so the case proves the reset is total. Shared with the ecs `newGame`
// transaction, whose spec is `State.create`.
export const cases: readonly ConformanceCase<void>[] = [
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
      hazards: [{ kind: "log", lane: 1, x: 0, width: 2, velocity: 1 }],
      frog: { x: 1, y: 2 },
      lives: 0,
      score: 7,
      status: "gameOver",
    },
    args: undefined,
    after: State.create(),
  },
];
