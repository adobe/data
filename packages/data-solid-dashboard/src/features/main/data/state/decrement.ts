// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Lower the counter by one, never below zero. A no-op at zero returns `state`
// unchanged (no log entry), keeping the transform idempotent at the floor.
export const decrement = <T extends Pick<State, "count" | "log">>(state: T): T => {
  if (state.count <= 0) return state;
  const count = state.count - 1;
  return { ...state, count, log: [...state.log, `Decremented to ${count}`] };
};
