// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.setSpriteActive`. The ui supplies the
// entity directly; the action commits through the same-named transaction.
export const setSpriteActive = (
  db: TransactionDatabase,
  input: { readonly id: Entity; readonly active: boolean },
) => {
  db.transactions.setSpriteActive(input);
};
