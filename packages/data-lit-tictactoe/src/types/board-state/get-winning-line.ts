// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import type { WinningLine } from "../winning-line";

const LINES: readonly WinningLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const getWinningLine = (board: BoardState): WinningLine | null => {
  for (const [a, b, c] of LINES) {
    const mark = board[a];
    if (mark !== " " && mark === board[b] && mark === board[c]) {
      return [a, b, c];
    }
  }
  return null;
};
