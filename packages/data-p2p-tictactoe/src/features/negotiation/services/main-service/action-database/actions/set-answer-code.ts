// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.setAnswerCode`: commits the state transition
// through a single transaction.
export const setAnswerCode = (db: ServiceDatabase, { code }: { code: string }) => {
  db.transactions.setAnswerCode({ code });
};
