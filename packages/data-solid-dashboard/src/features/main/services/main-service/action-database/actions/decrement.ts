// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.decrement` — commits the transaction.
export const decrement = (db: TransactionDatabase) => {
  db.transactions.decrement();
};
