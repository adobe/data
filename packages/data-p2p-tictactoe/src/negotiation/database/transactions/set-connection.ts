// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConnectionState } from "../../types/connection-state.js";
import type { CoreDatabase } from "../core-database.js";

export const setConnection = (
  t: CoreDatabase.Store,
  { state, sessionId }: { state: ConnectionState; sessionId?: string | null },
) => {
  t.resources.connection = state;
  if (sessionId !== undefined) t.resources.sessionId = sessionId;
};
