// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// The app-facing realization of `State.fireBullet`: a local shot needs no outside
// capability, so it commits through the single `fireBullet` transaction (which
// reads the current ship from the store and inserts the muzzle bullet). The UI
// never awaits this — state flows back through observables.
export const fireBullet = (db: ServiceDatabase) => {
  db.transactions.fireBullet();
};
