// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.startJoinSignaling`: commits the state
// transition through a single transaction.
export const startJoinSignaling = (db: ServiceDatabase) => {
  db.transactions.startJoinSignaling();
};
