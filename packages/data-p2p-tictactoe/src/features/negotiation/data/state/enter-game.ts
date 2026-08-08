// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/**
 * Transition to the live game once the peer connection is established. The
 * non-serializable game database handle it accompanies is stored separately by
 * the ecs `setGameDb` transaction; this pure step models only the visible
 * phase / connection change.
 */
export const enterGame = <T extends State>(state: T): T => ({
  ...state,
  phase: "game",
  connection: "connected",
});

// Spec-owned cases, shared with the ecs `setGameDb` transaction (a differently
// named transaction whose visible effect is exactly this) and the `enterGame`
// action. A no-arg transition, so `args` is `undefined`.
export const cases: Conformance<typeof enterGame> = [
  {
    name: "moves to the game phase, connected",
    before: {
      phase: "host-signaling", connection: "connecting", role: "host", sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: undefined,
    after: {
      phase: "game", connection: "connected", role: "host", sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
  },
];
