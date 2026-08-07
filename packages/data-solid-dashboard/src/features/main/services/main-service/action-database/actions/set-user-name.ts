// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.setUserName` — commits the transaction.
export const setUserName = (db: TransactionDatabase, input: { readonly name: string }) => {
  db.transactions.setUserName(input);
};
