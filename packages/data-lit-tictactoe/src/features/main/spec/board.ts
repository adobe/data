// © 2026 Adobe. MIT License. See /LICENSE for details.
import { BoardState } from "../data/values/board-state/board-state.js";
import type { State } from "./state.js";

// The board picture folded from the placed marks.
export const board = (state: Pick<State, "marks">): BoardState =>
  BoardState.fromMarks(state.marks.values());
