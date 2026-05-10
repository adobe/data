// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";
import { getMoveCount } from "./get-move-count.js";

export const currentPlayer = (
    board: BoardState,
    firstPlayer: PlayerMark,
): PlayerMark =>
    getMoveCount(board) % 2 === 0 ? firstPlayer : firstPlayer === "X" ? "O" : "X";
