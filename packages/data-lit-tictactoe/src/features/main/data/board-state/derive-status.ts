// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import type { GameStatus } from "../game-status/game-status.js";
import { getWinningLine } from "./get-winning-line.js";
import { isBoardFull } from "./is-board-full.js";

export const deriveStatus = (board: BoardState): GameStatus => {
  if (getWinningLine(board)) return "won";
  if (isBoardFull(board)) return "draw";
  return (board.match(/[XO]/g) ?? []).length > 0 ? "in_progress" : "idle";
};
