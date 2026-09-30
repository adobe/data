// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { TransactionDatabase } from "../transactions/transaction-database.js";

// The app-facing realization of the spec's `toggleSpriteActive`.
export const toggleSpriteActive = (
  db: TransactionDatabase,
  { id }: { readonly id: Entity },
) => {
  db.transactions.toggleSpriteActive({ id });
};
