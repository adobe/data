// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Return the counter to zero and record the reset in the activity log.
export const reset = <T extends Pick<State, "count" | "log">>(state: T): T => ({
  ...state,
  count: 0,
  log: [...state.log, "Reset to 0"],
});
