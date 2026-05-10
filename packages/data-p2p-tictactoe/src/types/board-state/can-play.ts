// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import { isGameOver } from "./is-game-over.js";
import { getCell } from "./get-cell.js";

export const canPlay = (board: BoardState, index: number): boolean =>
    !isGameOver(board) && getCell(board, index) === " ";
