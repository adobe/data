// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { playMove } from "./play-move.js";
import { marksOf } from "./marks-of.js";

// `before` is a delta over `State.create()` (empty board, X first, zeroed scores);
// `after` is the marks the move leaves. `index` is a cell index, not an entity
// reference, so no `args` schema is authored.
export const cases: Conformance.SpecCases<State, typeof playMove> = {
  cases: [
    {
      name: "places the first player's mark into an empty cell",
      before: {},
      args: { index: 4 },
      after: { marks: marksOf("    X    ") },
    },
    {
      name: "alternates to the opponent by move count",
      before: { marks: marksOf("    X    ") },
      args: { index: 0 },
      after: { marks: marksOf("O   X    ") },
    },
    {
      name: "honors a first player of O",
      before: { firstPlayer: "O" },
      args: { index: 8 },
      after: { marks: marksOf("        O") },
    },
    {
      name: "completes a three-in-a-row (a winning placement is still just a placement)",
      before: { marks: marksOf("XX  OO   "), xWins: 1, oWins: 2 },
      args: { index: 2 },
      after: { marks: marksOf("XXX OO   ") },
    },
    {
      name: "ignores an occupied cell",
      before: { marks: marksOf("    X    ") },
      args: { index: 4 },
      after: { marks: marksOf("    X    ") },
    },
    {
      name: "ignores an out-of-bounds index",
      before: {},
      args: { index: 9 },
      after: { marks: new Map() },
    },
    {
      name: "ignores a move once the game is won",
      before: { marks: marksOf("XXXOO    ") },
      args: { index: 5 },
      after: { marks: marksOf("XXXOO    ") },
    },
  ],
};
