// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";

export const getMoveCount = (board: BoardState): number =>
    board.split("").filter(c => c !== " ").length;
