// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";

/** The initial negotiation state: idle, no role, all codes empty. */
export const create = (): State => ({
  phase: "idle",
  connection: "idle",
  role: null,
  sessionId: null,
  offerCode: "",
  answerCode: "",
  bannerText: "",
  bannerError: false,
  hostAnswerInput: "",
  joinerOfferInput: "",
});
