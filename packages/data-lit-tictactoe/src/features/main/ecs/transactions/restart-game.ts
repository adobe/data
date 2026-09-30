// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../data/values/board-state/board-state.js";
import { PlayerMark } from "../../data/values/player-mark/player-mark.js";
import type { CoreDatabase } from "../core/core-database.js";
import { readBoard } from "./read-board.js";

// Tally the finished game into the scoreboard, hand the first move to the other
// player, and clear the board by deleting every placed mark (tail first, so no
// delete shifts a row still to visit).
export const restartGame = (t: CoreDatabase.Store) => {
  const winner = BoardState.getWinner(readBoard(t));
  if (winner === "X") t.resources.xWins++;
  else if (winner === "O") t.resources.oWins++;
  else if (winner === "cat") t.resources.draws++;
  t.resources.firstPlayer = PlayerMark.opponent[t.resources.firstPlayer];

  for (const arch of t.queryArchetypes(t.archetypes.PlacedMark.components)) {
    for (let row = arch.rowCount - 1; row >= 0; row--) {
      t.delete(arch.columns.id.get(row));
    }
  }
};
