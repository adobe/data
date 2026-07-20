// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { BoardState } from "./board-state.js";
import { PlayerMark } from "../player-mark/player-mark.js";

export const currentPlayer = (
  board: BoardState,
  firstPlayer: PlayerMark,
): PlayerMark => {
  const xCount = (board.match(/X/g) ?? []).length;
  const oCount = (board.match(/O/g) ?? []).length;
  return xCount === oCount ? firstPlayer : PlayerMark.opponent[firstPlayer];
};
