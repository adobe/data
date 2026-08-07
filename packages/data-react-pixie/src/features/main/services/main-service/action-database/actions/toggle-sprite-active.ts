// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/data/ecs";
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.toggleSpriteActive`.
export const toggleSpriteActive = (db: TransactionDatabase, entity: Entity) => {
  db.transactions.toggleSpriteActive({ entity });
};
