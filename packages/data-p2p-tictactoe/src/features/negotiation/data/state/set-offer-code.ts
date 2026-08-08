// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/** Record the generated host invite code and clear any pending banner. */
export const setOfferCode = <T extends State>(
  state: T,
  { code }: { code: string },
): T => ({ ...state, offerCode: code, bannerText: "" });

// Spec-owned cases, shared with the ecs `setOfferCode` transaction and action.
export const cases: Conformance<typeof setOfferCode> = [
  {
    name: "stores the offer code and clears the banner",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "please wait", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { code: "OFFER-123" },
    after: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "OFFER-123", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
  },
];
