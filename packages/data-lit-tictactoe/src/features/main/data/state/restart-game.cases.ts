// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConformanceCase } from "./conformance-case.js";

// Spec-owned `{ before, args, after }` cases for `State.restartGame` (no args),
// shared with the ecs `restartGame` transaction. Every restart clears the board
// and hands the first move to the other player; the scoreboard is bumped only
// for the finished game's outcome — X win, O win, draw (cat), or, when the game
// wasn't finished, no counter at all.
export const cases: readonly ConformanceCase<undefined>[] = [
  {
    name: "tallies an X win, alternates first player, clears the board",
    before: { board: "XXX      ", firstPlayer: "X", xWins: 0, oWins: 0, draws: 0 },
    args: undefined,
    after: { board: "         ", firstPlayer: "O", xWins: 1, oWins: 0, draws: 0 },
  },
  {
    name: "tallies an O win",
    before: { board: "OOOXX    ", firstPlayer: "O", xWins: 1, oWins: 2, draws: 0 },
    args: undefined,
    after: { board: "         ", firstPlayer: "X", xWins: 1, oWins: 3, draws: 0 },
  },
  {
    name: "tallies a draw (full board, no line)",
    before: { board: "XOXXOOOXX", firstPlayer: "O", xWins: 2, oWins: 1, draws: 0 },
    args: undefined,
    after: { board: "         ", firstPlayer: "X", xWins: 2, oWins: 1, draws: 1 },
  },
  {
    name: "restarts an unfinished game without touching any counter",
    before: { board: "X O      ", firstPlayer: "X", xWins: 1, oWins: 1, draws: 1 },
    args: undefined,
    after: { board: "         ", firstPlayer: "O", xWins: 1, oWins: 1, draws: 1 },
  },
];
