// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../data/board-state/board-state.js";
import { PlayerMark } from "../../data/player-mark/player-mark.js";
import type { CoreDatabase } from "../core-database.js";
import { readBoard } from "./read-board.js";

/**
 * Tally the finished game into the win/draw counters, hand the first move to
 * the opposite player, and clear the board by deleting every PlacedMark entity.
 */
export const restartGame = (t: CoreDatabase.Store) => {
  const board = readBoard(t);
  const winner = BoardState.getWinner(board);
  const status = BoardState.deriveStatus(board);
  if (winner === "X") t.resources.xWins = t.resources.xWins + 1;
  else if (winner === "O") t.resources.oWins = t.resources.oWins + 1;
  else if (status === "draw") t.resources.draws = t.resources.draws + 1;
  t.resources.firstPlayer = PlayerMark.opponent[t.resources.firstPlayer];

  for (const arch of t.queryArchetypes(t.archetypes.PlacedMark.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      t.delete(arch.columns.id.get(row));
    }
  }
};
