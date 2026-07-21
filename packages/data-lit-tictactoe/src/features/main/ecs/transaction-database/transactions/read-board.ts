// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../../data/board-state/board-state.js";
import type { PlacedMark } from "../../../data/placed-mark/placed-mark.js";
import type { ArchetypeDatabase } from "../../archetype-database/archetype-database.js";

// Synchronously project the placed-mark entities into a BoardState snapshot,
// for transactions that need the current board (playMove, restartGame). The
// board computed does the same projection reactively.
export const readBoard = (t: ArchetypeDatabase.Store): BoardState => {
  const marks: PlacedMark[] = [];
  for (const arch of t.queryArchetypes(t.archetypes.PlacedMark.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      marks.push({
        mark: arch.columns.mark.get(row),
        index: arch.columns.index.get(row),
      });
    }
  }
  return BoardState.fromMarks(marks);
};
