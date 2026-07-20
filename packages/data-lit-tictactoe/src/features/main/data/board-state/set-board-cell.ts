// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { BoardState } from "./board-state.js";
import type { PlayerMark } from "../player-mark/player-mark.js";

// Return the board with `mark` placed at `index` (pure — the spec's write).
export const setBoardCell = (args: {
  board: BoardState;
  index: number;
  mark: PlayerMark;
}): BoardState => {
  const { board, index, mark } = args;
  return board.slice(0, index) + mark + board.slice(index + 1);
};
