// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { BoardState } from "../data/values/board-state/board-state.js";
import type { PlacedMark } from "../data/entities/placed-mark.js";
import { PlayerMark } from "../data/values/player-mark/player-mark.js";

// Fixture helper: the placed marks drawn in a nine-character board, keyed by spec-id
// in cell order, so cases and samples can author a board as its picture. Not a
// conformed fn (absent from `transforms`).
export const marksOf = (board: BoardState): ReadonlyMap<number, PlacedMark> => {
  const marks = new Map<number, PlacedMark>();
  [...board].forEach((cell, cellIndex) => {
    if (PlayerMark.is(cell)) marks.set(marks.size + 1, { mark: cell, cellIndex });
  });
  return marks;
};
