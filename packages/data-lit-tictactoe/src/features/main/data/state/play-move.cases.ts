// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { playMove } from "./play-move.js";

// Inert, spec-owned cases for `playMove` — data only, no test-framework runtime
// import (the `Conformance` binding is `import type`). `before` is a delta over
// `State.create()` (empty board, X first, zeroed scores); `after` lists only what
// the move writes — the board. `index` is a plain cell index, not an entity
// reference, so no `args` schema is authored. Covers a legal placement, turn
// alternation by move count, a winning placement, and the three rejections
// (occupied, out of bounds, already won) that leave the board as-is.
export const cases: Conformance.SpecCases<State, typeof playMove> = {
  cases: [
    {
      name: "places the first player's mark into an empty cell",
      before: {},
      args: { index: 4 },
      after: { board: "    X    " },
    },
    {
      name: "alternates to the opponent by move count",
      before: { board: "    X    " },
      args: { index: 0 },
      after: { board: "O   X    " },
    },
    {
      name: "completes a three-in-a-row (winning placement is still just a placement)",
      before: { board: "XX  OO   ", xWins: 1, oWins: 2 },
      args: { index: 2 },
      after: { board: "XXX OO   " },
    },
    {
      name: "ignores an occupied cell (no-op)",
      before: { board: "    X    " },
      args: { index: 4 },
      after: { board: "    X    " },
    },
    {
      name: "ignores an out-of-bounds index (no-op)",
      before: { firstPlayer: "O" },
      args: { index: 9 },
      after: { board: "         " },
    },
    {
      name: "ignores a move once the game is already won (no-op)",
      before: { board: "XXX      " },
      args: { index: 4 },
      after: { board: "XXX      " },
    },
  ],
};
