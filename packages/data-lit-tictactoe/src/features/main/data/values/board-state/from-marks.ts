// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { BoardState } from "./board-state.js";
import type { PlacedMark } from "../../entities/placed-mark.js";

// Fold the placed marks (the entity source of truth) into the compact
// index-addressed board the other helpers operate on.
export const fromMarks = (marks: Iterable<PlacedMark>): BoardState => {
  const cells: string[] = new Array(9).fill(" ");
  for (const { mark, cellIndex } of marks) cells[cellIndex] = mark;
  return cells.join("");
};
