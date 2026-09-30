// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Record the generated host invite code and clear any pending banner. */
export const setOfferCode = <T extends State>(
  state: T,
  { code }: { code: string },
): T => ({ ...state, offerCode: code, bannerText: "" });
