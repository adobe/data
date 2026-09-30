// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

export const setAnswerCode = (db: ServiceDatabase, { code }: { code: string }) => {
  db.transactions.setAnswerCode({ code });
};
