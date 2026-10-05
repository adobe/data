// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

export const setHostAnswerInput = (db: ServiceDatabase, { value }: { value: string }) => {
  db.transactions.setHostAnswerInput({ value });
};
