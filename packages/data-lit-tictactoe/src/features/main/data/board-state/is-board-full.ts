// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";

export const isBoardFull = (board: BoardState): boolean => !board.includes(" ");
