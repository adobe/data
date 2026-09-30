// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// Commits the `decrement` transaction.
export const decrement = (db: TransactionDatabase) => {
  db.transactions.decrement();
};
