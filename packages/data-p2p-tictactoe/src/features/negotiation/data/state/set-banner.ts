// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Set the banner text and whether it should be styled as an error. */
export const setBanner = <T extends State>(
  state: T,
  { text, error = false }: { text: string; error?: boolean },
): T => ({ ...state, bannerText: text, bannerError: error });
