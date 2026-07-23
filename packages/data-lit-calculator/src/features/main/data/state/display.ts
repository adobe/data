// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// The string to show: the current entry, or "Error" once a non-finite result
// has been latched.
export const display = (state: Pick<State, "entry" | "error">): string =>
  state.error ? "Error" : state.entry;
