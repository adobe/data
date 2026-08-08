// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../board-state/board-state.js";
import type { State } from "./state.js";

// The default game state: an empty board, X to move first, a zeroed scoreboard.
// It is the baseline the conformance cases author their `before`/`input` as deltas
// over (passed to the runners as `initial`), and the state a fresh game starts in.
export const create = (): State => ({
  board: BoardState.createInitialBoard(),
  firstPlayer: "X",
  xWins: 0,
  oWins: 0,
  draws: 0,
});
