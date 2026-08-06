// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Empty the activity log. The counter and user name are left untouched.
export const clearLog = <T extends Pick<State, "log">>(state: T): T => ({
  ...state,
  log: [],
});
