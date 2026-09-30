// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";

export const getMoveCount = (board: BoardState): number =>
  (board.match(/[XO]/g) ?? []).length;
