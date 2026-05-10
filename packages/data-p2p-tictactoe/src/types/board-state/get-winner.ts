// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";
import { getWinningLine } from "./get-winning-line.js";
import { isBoardFull } from "./is-board-full.js";

export const getWinner = (board: BoardState): PlayerMark | null => {
    const line = getWinningLine(board);
    if (line) return board[line[0]] as PlayerMark;
    return isBoardFull(board) ? null : null;
};
