// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import type { GameStatus } from "../game-status/game-status.js";
import { getMoveCount } from "./get-move-count.js";
import { getWinningLine } from "./get-winning-line.js";
import { isBoardFull } from "./is-board-full.js";

export const deriveStatus = (board: BoardState): GameStatus => {
  if (getWinningLine(board)) return "won";
  if (isBoardFull(board)) return "draw";
  return getMoveCount(board) > 0 ? "in_progress" : "idle";
};
