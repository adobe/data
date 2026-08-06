// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Raise the counter by one and record it in the activity log.
export const increment = <T extends Pick<State, "count" | "log">>(state: T): T => {
  const count = state.count + 1;
  return { ...state, count, log: [...state.log, `Incremented to ${count}`] };
};
