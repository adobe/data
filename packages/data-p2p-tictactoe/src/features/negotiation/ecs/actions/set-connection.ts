// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConnectionState } from "../../data/values/connection-state/connection-state.js";
import type { ServiceDatabase } from "../services/service-database.js";

export const setConnection = (
  db: ServiceDatabase,
  { connection, sessionId }: { connection: ConnectionState; sessionId?: string | null },
) => {
  db.transactions.setConnection({ connection, sessionId });
};
