// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { BoardState } from "./board-state.js";
import type { CellIndex } from "../cell-index/cell-index.js";
import type { PlayerMark } from "../player-mark/player-mark.js";

// Fold placed marks into the compact index-addressed board the other helpers
// operate on. Takes the mark fields structurally, so values never import entities.
export const fromMarks = (
  marks: Iterable<{ readonly mark: PlayerMark; readonly cellIndex: CellIndex }>,
): BoardState => {
  const cells: string[] = new Array(9).fill(" ");
  for (const { mark, cellIndex } of marks) cells[cellIndex] = mark;
  return cells.join("");
};
