// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../../../data/board-state/board-state.js";
import type { PlacedMark } from "../../../data/placed-mark/placed-mark.js";
import type { IndexDatabase } from "../../index-database/index-database.js";

// The board snapshot, derived reactively from the placed-mark entities. The
// derive re-emits whenever a transaction adds or removes a mark. `withCache`
// shares one run across all subscribers (each cell element observes the board).
export const board = cached((db: IndexDatabase) =>
  Observe.withCache(db.derive((read) => {
    const marks: PlacedMark[] = [];
    for (const id of read.select(db.archetypes.PlacedMark.components)) {
      const m = read.read(id);
      if (m && m.mark !== undefined && m.index !== undefined) {
        marks.push({ mark: m.mark, index: m.index });
      }
    }
    return BoardState.fromMarks(marks);
  })),
);
