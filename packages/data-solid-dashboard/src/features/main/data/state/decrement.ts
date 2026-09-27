// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Lower the counter by one, never below zero. At the floor it writes the slice
// back unchanged (no log entry), keeping the transform idempotent at zero.
export const decrement = (
  state: Pick<State, "count" | "log">,
): Pick<State, "count" | "log"> => {
  if (state.count <= 0) return { count: state.count, log: state.log };
  const count = state.count - 1;
  return { count, log: [...state.log, `Decremented to ${count}`] };
};
