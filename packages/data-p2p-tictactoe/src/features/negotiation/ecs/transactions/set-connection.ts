// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConnectionState } from "../../data/values/connection-state/connection-state.js";
import type { CoreDatabase } from "../core/core-database.js";

export const setConnection = (
  t: CoreDatabase.Store,
  { connection, sessionId }: { connection: ConnectionState; sessionId?: string | null },
) => {
  t.resources.connection = connection;
  if (sessionId !== undefined) t.resources.sessionId = sessionId;
};
