// © 2026 Adobe. MIT License. See /LICENSE for details.
import { cached } from "@adobe/data/cache";
import { BoardState } from "../../data/board-state/board-state.js";
import type { PlacedMark } from "../../data/placed-mark/placed-mark.js";
import type { State } from "../../data/state/state.js";
import type { IndexDatabase } from "../index-database.js";

// The full logical `State` projected from the ECS — the conformance anchor
// between the data-layer spec and this implementation. Mark entities are folded
// back into the board string; scalars come straight from resources.
export const state = cached((db: IndexDatabase) =>
  db.derive((read): State => {
    const marks: PlacedMark[] = [];
    for (const id of read.select(db.archetypes.PlacedMark.components)) {
      const m = read.read(id);
      if (m && m.mark !== undefined && m.index !== undefined) {
        marks.push({ mark: m.mark, index: m.index });
      }
    }
    return {
      board: BoardState.fromMarks(marks),
      firstPlayer: read.resources.firstPlayer,
      xWins: read.resources.xWins,
      oWins: read.resources.oWins,
      draws: read.resources.draws,
    };
  }),
);
