// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// Commit one cursor move for the calling peer. The peer identity is the
// transaction's `userId`, so this takes only the `{ x, y }` payload.
export const movePresence = (db: TransactionDatabase, { x, y }: { x: number; y: number }) => {
  db.transactions.movePresence({ x, y });
};
