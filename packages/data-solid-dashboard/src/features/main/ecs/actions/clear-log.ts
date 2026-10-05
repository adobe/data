// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// Commits the `clearLog` transaction.
export const clearLog = (db: TransactionDatabase) => {
  db.transactions.clearLog();
};
