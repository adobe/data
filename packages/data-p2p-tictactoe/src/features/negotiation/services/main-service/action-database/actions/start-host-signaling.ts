// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.startHostSignaling`: a pure state transition,
// so it commits through a single transaction. (The imperative signaling that
// follows is orchestrated by the `connection` service, driven from `startHost`.)
export const startHostSignaling = (db: ServiceDatabase) => {
  db.transactions.startHostSignaling();
};
