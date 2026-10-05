// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import { WinningLine } from "../winning-line/winning-line.js";
import { BoardCell } from "../board-cell/board-cell.js";

export const getWinningLine = (board: BoardState): WinningLine | null => {
  for (const [a, b, c] of WinningLine.lines) {
    const mark = board[a];
    if (mark !== BoardCell.blank && mark === board[b] && mark === board[c]) {
      return [a, b, c];
    }
  }
  return null;
};
