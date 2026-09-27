// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Return the counter to zero and record the reset in the activity log.
export const reset = (
  state: Pick<State, "count" | "log">,
): Pick<State, "count" | "log"> => ({
  count: 0,
  log: [...state.log, "Reset to 0"],
});
