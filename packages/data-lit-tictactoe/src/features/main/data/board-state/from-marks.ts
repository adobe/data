// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { BoardState } from "./board-state.js";
import type { PlacedMark } from "../placed-mark/placed-mark.js";

// Project the placed marks (the entity source of truth) into the compact
// index-addressed board snapshot the pure helpers operate on.
export const fromMarks = (marks: readonly PlacedMark[]): BoardState => {
  const cells: string[] = new Array(9).fill(" ");
  for (const { mark, index } of marks) cells[index] = mark;
  return cells.join("");
};
