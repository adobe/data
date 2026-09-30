// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import { getWinningLine } from "./get-winning-line.js";
import { isBoardFull } from "./is-board-full.js";

export const isGameOver = (board: BoardState): boolean =>
  getWinningLine(board) !== null || isBoardFull(board);
