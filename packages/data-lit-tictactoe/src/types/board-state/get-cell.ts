// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import type { BoardCell } from "../board-cell";

export const getCell = (board: BoardState, index: number): BoardCell =>
  (board[index] as BoardCell) ?? " ";
