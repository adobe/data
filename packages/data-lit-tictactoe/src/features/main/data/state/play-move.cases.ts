// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PlayMoveArgs } from "../play-move-args/play-move-args.js";
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.playMove`, shared with
// the ecs `playMove` transaction. Covers every branch of the move guard —
// a legal placement, turn alternation by move count, a winning placement, plus
// the three rejections (occupied cell, out of bounds, game already over) that
// each leave the state unchanged.
export const cases: readonly ConformanceCase<PlayMoveArgs>[] = [
  {
    name: "places the first player's mark into an empty cell",
    before: { board: "         ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
    args: { index: 4 },
    after: { board: "    X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
  },
  {
    name: "alternates to the opponent by move count",
    before: { board: "    X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
    args: { index: 0 },
    after: { board: "O   X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
  },
  {
    name: "completes a three-in-a-row (winning placement is still just a placement)",
    before: { board: "XX  OO   ", firstPlayer: "X", xWins: 1, oWins: 2, draws: 0 },
    args: { index: 2 },
    after: { board: "XXX OO   ", firstPlayer: "X", xWins: 1, oWins: 2, draws: 0 },
  },
  {
    name: "ignores an occupied cell (no-op)",
    before: { board: "    X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
    args: { index: 4 },
    after: { board: "    X    ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
  },
  {
    name: "ignores an out-of-bounds index (no-op)",
    before: { board: "         ", firstPlayer: "O", xWins: 0, oWins: 0, draws: 0 },
    args: { index: 9 },
    after: { board: "         ", firstPlayer: "O", xWins: 0, oWins: 0, draws: 0 },
  },
  {
    name: "ignores a move once the game is already won (no-op)",
    before: { board: "XXX      ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
    args: { index: 4 },
    after: { board: "XXX      ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
  },
];
