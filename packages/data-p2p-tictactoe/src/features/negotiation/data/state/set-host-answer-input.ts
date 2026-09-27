// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Store the live value of the host's "paste answer" textarea. */
export const setHostAnswerInput = <T extends State>(
  state: T,
  { value }: { value: string },
): T => ({ ...state, hostAnswerInput: value });
