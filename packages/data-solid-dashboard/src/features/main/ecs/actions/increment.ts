// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// Commits the `increment` transaction.
export const increment = (db: TransactionDatabase) => {
  db.transactions.increment();
};
