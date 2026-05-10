// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";

export const play = (
    board: BoardState,
    index: number,
    mark: PlayerMark,
): BoardState =>
    board.slice(0, index) + mark + board.slice(index + 1);
