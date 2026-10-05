// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

export const setOfferCode = (db: ServiceDatabase, { code }: { code: string }) => {
  db.transactions.setOfferCode({ code });
};
