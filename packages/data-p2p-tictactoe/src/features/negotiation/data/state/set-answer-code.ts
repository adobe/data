// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/** Record the generated joiner answer code and clear any pending banner. */
export const setAnswerCode = <T extends State>(
  state: T,
  { code }: { code: string },
): T => ({ ...state, answerCode: code, bannerText: "" });

// Spec-owned cases, shared with the ecs `setAnswerCode` transaction and action.
export const cases: Conformance<typeof setAnswerCode> = [
  {
    name: "stores the answer code and clears the banner",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "Generating answer — please wait…",
      bannerError: false, hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { code: "ANSWER-456" },
    after: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "ANSWER-456", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
  },
];
