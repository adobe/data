// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.increment`. This feature has no external
// services to await, so the action just commits the transaction (exactly one).
export const increment = (db: TransactionDatabase) => {
  db.transactions.increment();
};
