// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import type { GameStatus } from "../game-status";
import { getWinningLine } from "./get-winning-line";
import { isBoardFull } from "./is-board-full";

export const deriveStatus = (board: BoardState): GameStatus => {
  if (getWinningLine(board)) return "won";
  if (isBoardFull(board)) return "draw";
  return (board.match(/[XO]/g) ?? []).length > 0 ? "in_progress" : "idle";
};
