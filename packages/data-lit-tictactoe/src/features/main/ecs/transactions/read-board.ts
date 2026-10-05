// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../../data/values/board-state/board-state.js";
import type { PlacedMark } from "../../data/entities/placed-mark.js";
import type { CoreDatabase } from "../core/core-database.js";

// The current board, folded from the placed-mark entities. Takes only the read
// surface, so transactions (a store), the `board` computed and the agent service
// (a `derive` read) all share it.
type BoardReader = Pick<CoreDatabase.Store, "select" | "read"> & {
  readonly archetypes: { readonly PlacedMark: Pick<CoreDatabase.Store["archetypes"]["PlacedMark"], "components"> };
};

export const readBoard = (db: BoardReader): BoardState => {
  const marks: PlacedMark[] = [];
  for (const id of db.select(db.archetypes.PlacedMark.components)) {
    const { mark, cellIndex } = db.read(id) ?? {};
    if (mark !== undefined && cellIndex !== undefined) marks.push({ mark, cellIndex });
  }
  return BoardState.fromMarks(marks);
};
