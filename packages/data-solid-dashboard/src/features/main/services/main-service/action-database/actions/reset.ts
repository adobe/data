// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.reset` — commits the transaction.
export const reset = (db: TransactionDatabase) => {
  db.transactions.reset();
};
