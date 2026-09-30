// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

export const setJoinerOfferInput = (db: ServiceDatabase, { value }: { value: string }) => {
  db.transactions.setJoinerOfferInput({ value });
};
