// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { SpriteKind } from "../../../../data/sprite-kind/sprite-kind.js";
import type { TransactionDatabase } from "../../transaction-database/transaction-database.js";

// The app-facing realization of `State.createSprite`. This transition injects no
// services, so the action just commits through the same-named transaction.
export const createSprite = (
  db: TransactionDatabase,
  input: { readonly position: Vec2; readonly rotation?: number; readonly kind: SpriteKind },
) => {
  db.transactions.createSprite(input);
};
