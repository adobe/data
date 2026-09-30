// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

// Needs no outside capability: the tally and board reset commit as one transaction.
export const restartGame = (db: ServiceDatabase) => {
  db.transactions.restartGame();
};
