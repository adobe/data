// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../../../data/board-state/board-state.js";
import type { PlacedMark } from "../../../../data/placed-mark/placed-mark.js";
import type { ServiceDatabase } from "../../service-database/service-database.js";

// The app-facing realization of `State.playOpponentMove`: read the current board
// **synchronously from the store** (not a cached computed — reactive computeds
// refresh only on committed transactions, so an imperative read of one can be
// stale), await the opponent port's selected index (the async outside-world
// work), then commit exactly one placement through `playMove`. `selectMove` is a
// value-returning read, not a fire-and-forget effect.
export const playOpponentMove = async (db: ServiceDatabase) => {
  const marks: PlacedMark[] = [];
  for (const id of db.select(db.archetypes.PlacedMark.components)) {
    const mark = db.read(id);
    if (mark && mark.mark !== undefined && mark.index !== undefined) {
      marks.push({ mark: mark.mark, index: mark.index });
    }
  }
  const index = await db.services.opponent.selectMove(BoardState.fromMarks(marks));
  db.transactions.playMove({ index });
};
