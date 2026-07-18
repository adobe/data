// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

export const toggleDisplayCompleted = <T extends Pick<State, "displayCompleted">>(
  state: T,
): T => ({
  ...state,
  displayCompleted: !state.displayCompleted,
});
