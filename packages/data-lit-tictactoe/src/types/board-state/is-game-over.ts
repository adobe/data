// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import { getWinningLine } from "./get-winning-line";
import { isBoardFull } from "./is-board-full";

export const isGameOver = (board: BoardState): boolean =>
  getWinningLine(board) !== null || isBoardFull(board);
