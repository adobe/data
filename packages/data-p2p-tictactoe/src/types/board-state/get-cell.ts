// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";

export type Cell = " " | "X" | "O";

export const getCell = (board: BoardState, index: number): Cell =>
    (board[index] ?? " ") as Cell;
