// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// Commits the `setUserName` transaction.
export const setUserName = (db: TransactionDatabase, input: { readonly name: string }) => {
  db.transactions.setUserName(input);
};
