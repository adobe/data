// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Digit } from "../digit/digit.js";
import type { State } from "./state.js";

// Type a digit into the current entry. When overwriting (fresh entry), the
// digit replaces the display; otherwise it appends, collapsing a lone leading
// zero. No-op while an error is showing.
export const inputDigit = <T extends Pick<State, "entry" | "overwrite" | "error">>(
  state: T,
  digit: Digit,
): T => {
  if (state.error) return state;
  if (state.overwrite) {
    return { ...state, entry: digit, overwrite: false };
  }
  return { ...state, entry: state.entry === "0" ? digit : state.entry + digit };
};
