// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

// Add a decimal point to the current entry. When overwriting, start "0.".
// Idempotent: a second point is ignored. No-op while an error is showing.
export const inputDecimal = <T extends Pick<State, "entry" | "overwrite" | "error">>(
  state: T,
): T => {
  if (state.error) return state;
  if (state.overwrite) {
    return { ...state, entry: "0.", overwrite: false };
  }
  if (state.entry.includes(".")) return state;
  return { ...state, entry: state.entry + "." };
};
