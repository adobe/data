// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/** Enter the joiner signaling screen, ready to paste the host's invite code. */
export const startJoinSignaling = <T extends State>(state: T): T => ({
  ...state,
  phase: "join-signaling",
  role: "joiner",
  connection: "connecting",
  bannerText: "",
  bannerError: false,
});

// Spec-owned cases, shared with the ecs `startJoinSignaling` transaction and
// action. A no-arg transition, so `args` is `undefined`.
export const cases: Conformance<typeof startJoinSignaling> = [
  {
    name: "enters join-signaling as joiner, connecting, clearing the banner",
    before: {
      phase: "idle", connection: "idle", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "stale", bannerError: true,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: undefined,
    after: {
      phase: "join-signaling", connection: "connecting", role: "joiner", sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
  },
];
