// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConnectionState } from "../connection-state/connection-state.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

/**
 * Update the connection lifecycle, optionally recording the sync session id.
 * Omitting `sessionId` leaves the existing value untouched.
 */
export const setConnection = <T extends State>(
  state: T,
  { connection, sessionId }: { connection: ConnectionState; sessionId?: string | null },
): T => ({
  ...state,
  connection,
  sessionId: sessionId !== undefined ? sessionId : state.sessionId,
});

// Spec-owned cases, shared with the ecs `setConnection` transaction and action.
export const cases: Conformance<typeof setConnection> = [
  {
    name: "records a connected state with a session id",
    before: {
      phase: "idle", connection: "connecting", role: null, sessionId: null,
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { connection: "connected", sessionId: "sess-1" },
    after: {
      phase: "idle", connection: "connected", role: null, sessionId: "sess-1",
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
  },
  {
    name: "updates only the connection when no session id is supplied",
    before: {
      phase: "idle", connection: "connected", role: null, sessionId: "sess-1",
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
    args: { connection: "disconnected" },
    after: {
      phase: "idle", connection: "disconnected", role: null, sessionId: "sess-1",
      offerCode: "", answerCode: "", bannerText: "", bannerError: false,
      hostAnswerInput: "", joinerOfferInput: "",
    },
  },
];
