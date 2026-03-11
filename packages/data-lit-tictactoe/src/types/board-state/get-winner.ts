// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import type { PlayerMark } from "../player-mark/player-mark";
import { getWinningLine } from "./get-winning-line";
import { isBoardFull } from "./is-board-full";

export const getWinner = (
  board: BoardState,
): PlayerMark | "cat" | null => {
  const line = getWinningLine(board);
  if (line) return board[line[0]] as PlayerMark;
  return isBoardFull(board) ? "cat" : null;
};
