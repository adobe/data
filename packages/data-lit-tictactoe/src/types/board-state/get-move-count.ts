// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";

export const getMoveCount = (board: BoardState): number =>
  (board.match(/[XO]/g) ?? []).length;
