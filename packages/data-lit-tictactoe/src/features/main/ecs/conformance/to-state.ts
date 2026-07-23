// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "../../data/state/state.js";
import { BoardState } from "../../data/board-state/board-state.js";
import type { PlacedMark } from "../../data/placed-mark/placed-mark.js";
import type { CoreDatabase } from "../core-database/core-database.js";

// Read a store back into a `data/` `State` — the inverse of `fromState`. The
// placed marks are read through the PlacedMark archetype's full component set
// (not an incidental single column) and folded into the compact board string,
// then joined with the scalar resources. Test-only.
const readBoard = (store: CoreDatabase.Store): BoardState => {
  const marks: PlacedMark[] = [];
  for (const arch of store.queryArchetypes(store.archetypes.PlacedMark.components)) {
    for (let row = 0; row < arch.rowCount; row++) {
      marks.push({
        mark: arch.columns.mark.get(row),
        index: arch.columns.index.get(row),
      });
    }
  }
  return BoardState.fromMarks(marks);
};

export const toState = (store: CoreDatabase.Store): State => ({
  board: readBoard(store),
  firstPlayer: store.resources.firstPlayer,
  xWins: store.resources.xWins,
  oWins: store.resources.oWins,
  draws: store.resources.draws,
});
