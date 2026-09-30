// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// The default state: an empty board, X to move first, a zeroed scoreboard. Cases
// author their `before`/`input` as deltas over it.
export const create = (): State => ({
  marks: new Map(),
  firstPlayer: "X",
  xWins: 0,
  oWins: 0,
  draws: 0,
});
