// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import { getWinner } from "./get-winner.js";
import { isBoardFull } from "./is-board-full.js";

export const isGameOver = (board: BoardState): boolean =>
    getWinner(board) !== null || isBoardFull(board);
