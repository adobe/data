// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.setJoinerOfferInput`: commits the state
// transition through a single transaction.
export const setJoinerOfferInput = (db: ServiceDatabase, { value }: { value: string }) => {
  db.transactions.setJoinerOfferInput({ value });
};
