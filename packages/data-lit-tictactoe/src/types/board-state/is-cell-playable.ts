// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import { deriveStatus } from "./derive-status";
import { getCell } from "./get-cell";

export const isCellPlayable = (board: BoardState, index: number): boolean => {
  const status = deriveStatus(board);
  const cell = getCell(board, index);
  return (
    (status === "in_progress" || status === "idle") && cell === " "
  );
};
