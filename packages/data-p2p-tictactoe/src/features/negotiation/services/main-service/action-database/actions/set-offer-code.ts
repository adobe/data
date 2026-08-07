// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.setOfferCode`: commits the state transition
// through a single transaction.
export const setOfferCode = (db: ServiceDatabase, { code }: { code: string }) => {
  db.transactions.setOfferCode({ code });
};
