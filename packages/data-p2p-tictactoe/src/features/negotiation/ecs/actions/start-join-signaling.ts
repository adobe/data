// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

export const startJoinSignaling = (db: ServiceDatabase) => {
  db.transactions.startJoinSignaling();
};
