// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../types/board-state/board-state.js";
import { PlayerMark } from "../../types/player-mark/player-mark.js";
import type { CoreDatabase } from "../core-database.js";

/**
 * Tally the finished game into the win/draw counters, hand the first move to
 * the opposite player, and clear the board for a fresh game.
 */
export const restartGame = (t: CoreDatabase.Store) => {
  const winner = BoardState.getWinner(t.resources.board);
  const status = BoardState.deriveStatus(t.resources.board);
  if (winner === "X") t.resources.xWins = t.resources.xWins + 1;
  else if (winner === "O") t.resources.oWins = t.resources.oWins + 1;
  else if (status === "draw") t.resources.draws = t.resources.draws + 1;
  t.resources.firstPlayer = PlayerMark.opponent[t.resources.firstPlayer];
  t.resources.board = BoardState.createInitialBoard();
};
