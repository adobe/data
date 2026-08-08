// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.setBanner`: commits the state transition
// through a single transaction.
export const setBanner = (db: ServiceDatabase, { text, error }: { text: string; error?: boolean }) => {
  db.transactions.setBanner({ text, error });
};
