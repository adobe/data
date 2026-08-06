// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Store the live value of the joiner's "paste offer" textarea. */
export const setJoinerOfferInput = <T extends State>(
  state: T,
  { value }: { value: string },
): T => ({ ...state, joinerOfferInput: value });
