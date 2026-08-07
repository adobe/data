// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/** Store the live value of the joiner's "paste offer" textarea. */
export const setJoinerOfferInput = <T extends State>(
  state: T,
  { value }: { value: string },
): T => ({ ...state, joinerOfferInput: value });

// Spec-owned cases, shared with the ecs `setJoinerOfferInput` transaction and action.
export const cases: Conformance<typeof setJoinerOfferInput> = [
  {
    name: "stores the joiner offer input",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { value: "OFFER-xyz" },
    after: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "OFFER-xyz",
    },
  },
];
