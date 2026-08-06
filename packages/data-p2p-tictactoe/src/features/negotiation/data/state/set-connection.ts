// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConnectionState } from "../connection-state/connection-state.js";
import type { State } from "./state.js";

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
