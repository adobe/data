// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state";
import type { PlayerMark } from "../player-mark/player-mark";

export const setBoardCell = (args: {
  board: BoardState;
  index: number;
  mark: PlayerMark;
}): BoardState => {
  const { board, index, mark } = args;
  return board.slice(0, index) + mark + board.slice(index + 1);
};
