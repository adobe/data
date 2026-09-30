// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { WinningLine } from "./winning-line.js";

// The eight lines (rows, columns, diagonals) that win a game, as board indices.
export const lines: readonly WinningLine[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];
