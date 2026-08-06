// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** Record the generated joiner answer code and clear any pending banner. */
export const setAnswerCode = <T extends State>(
  state: T,
  { code }: { code: string },
): T => ({ ...state, answerCode: code, bannerText: "" });
