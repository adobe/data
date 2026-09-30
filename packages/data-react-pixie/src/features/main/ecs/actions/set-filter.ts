// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FilterKind } from "../../data/values/filter-kind/filter-kind.js";
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// The app-facing realization of the spec's `setFilter`.
export const setFilter = (db: TransactionDatabase, input: { readonly filter: FilterKind }) => {
  db.transactions.setFilter(input);
};
