// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import { getWinningLine } from "./get-winning-line";

export const isCellWinning = (board: BoardState, index: number): boolean => {
  const line = getWinningLine(board);
  return line !== null && line.includes(index);
};
