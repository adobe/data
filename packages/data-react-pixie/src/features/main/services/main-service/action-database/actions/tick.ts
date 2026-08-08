// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.tick`, driven per-frame by the render loop.
export const tick = (db: TransactionDatabase, input: { readonly delta: number }) => {
  db.transactions.tick(input);
};
