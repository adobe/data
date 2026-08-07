// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/** Enter the host signaling screen and begin waiting for an invite code. */
export const startHostSignaling = <T extends State>(state: T): T => ({
  ...state,
  phase: "host-signaling",
  role: "host",
  connection: "connecting",
  bannerText: "Generating invite code — please wait…",
  bannerError: false,
});

// Spec-owned cases, shared with the ecs `startHostSignaling` transaction and
// action. A no-arg transition, so `args` is `undefined`.
export const cases: Conformance<typeof startHostSignaling> = [
  {
    name: "enters host-signaling as host, connecting, with a waiting banner",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: undefined,
    after: {
      phase: "host-signaling", connection: "connecting", role: "host", sessionId: null,
      offerCode: "", answerCode: "", bannerText: "Generating invite code — please wait…",
      bannerError: false, hostAnswerInput: "", joinerOfferInput: "",
    },
  },
];
