// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../data/values/board-state/board-state.js";
import type { PlacedMark } from "../../data/entities/placed-mark.js";
import type { CoreDatabase } from "../core/core-database.js";

// The current board, folded synchronously from the placed-mark entities (the
// `board` computed is the reactive counterpart). Shared by playMove and restartGame.
export const readBoard = (t: CoreDatabase.Store): BoardState => {
  const marks: PlacedMark[] = [];
  for (const arch of t.queryArchetypes(t.archetypes.PlacedMark.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      marks.push({ mark: arch.columns.mark.get(row), cellIndex: arch.columns.cellIndex.get(row) });
    }
  }
  return BoardState.fromMarks(marks);
};
