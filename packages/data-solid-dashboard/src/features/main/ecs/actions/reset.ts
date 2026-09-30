// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// Commits the `reset` transaction.
export const reset = (db: TransactionDatabase) => {
  db.transactions.reset();
};
