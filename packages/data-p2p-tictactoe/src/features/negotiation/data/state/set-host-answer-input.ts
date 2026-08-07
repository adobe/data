// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/** Store the live value of the host's "paste answer" textarea. */
export const setHostAnswerInput = <T extends State>(
  state: T,
  { value }: { value: string },
): T => ({ ...state, hostAnswerInput: value });

// Spec-owned cases, shared with the ecs `setHostAnswerInput` transaction and action.
export const cases: Conformance<typeof setHostAnswerInput> = [
  {
    name: "stores the host answer input",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { value: "ANSWER-abc" },
    after: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "ANSWER-abc", joinerOfferInput: "",
    },
  },
];
