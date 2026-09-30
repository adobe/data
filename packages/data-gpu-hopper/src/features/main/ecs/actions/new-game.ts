// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// Start over from the initial level.
export const newGame = (db: TransactionDatabase) => {
  db.transactions.newGame();
};
