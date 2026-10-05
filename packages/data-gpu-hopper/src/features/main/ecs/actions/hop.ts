// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Direction } from "../../data/values/direction/direction.js";
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// The player's hop input.
export const hop = (db: TransactionDatabase, args: { readonly direction: Direction }) => {
  db.transactions.hop(args);
};
