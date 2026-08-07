// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ConnectionState } from "../../../../data/connection-state/connection-state.js";
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.setConnection`: commits the state transition
// through a single transaction.
export const setConnection = (
  db: ServiceDatabase,
  { connection, sessionId }: { connection: ConnectionState; sessionId?: string | null },
) => {
  db.transactions.setConnection({ connection, sessionId });
};
