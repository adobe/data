// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { FilterKind } from "../../../../data/filter-kind/filter-kind.js";
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.setFilter`.
export const setFilter = (db: TransactionDatabase, input: { readonly filter: FilterKind }) => {
  db.transactions.setFilter(input);
};
