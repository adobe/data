// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

export const setBanner = (db: ServiceDatabase, { text, error }: { text: string; error?: boolean }) => {
  db.transactions.setBanner({ text, error });
};
