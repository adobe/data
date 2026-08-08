// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.setHostAnswerInput`: commits the state
// transition through a single transaction.
export const setHostAnswerInput = (db: ServiceDatabase, { value }: { value: string }) => {
  db.transactions.setHostAnswerInput({ value });
};
