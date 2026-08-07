// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.setSpriteHovered`.
export const setSpriteHovered = (
  db: TransactionDatabase,
  input: { readonly entity: Entity; readonly hovered: boolean },
) => {
  db.transactions.setSpriteHovered(input);
};
