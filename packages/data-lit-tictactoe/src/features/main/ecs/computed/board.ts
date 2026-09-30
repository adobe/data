// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { Observe } from "@adobe/data/observe";
import { BoardState } from "../../data/values/board-state/board-state.js";
import type { PlacedMark } from "../../data/entities/placed-mark.js";
import type { IndexDatabase } from "../indexes/index-database.js";

// The board, folded from the placed-mark entities; re-emits whenever a mark is added
// or removed. `withCache` shares one run across every subscriber (each cell observes it).
export const board = cached((db: IndexDatabase) =>
  Observe.withCache(
    db.derive((db) => {
      const marks: PlacedMark[] = [];
      for (const id of db.select(db.archetypes.PlacedMark.components)) {
        const { mark, cellIndex } = db.read(id) ?? {};
        if (mark !== undefined && cellIndex !== undefined) marks.push({ mark, cellIndex });
      }
      return BoardState.fromMarks(marks);
    }),
  ),
);
