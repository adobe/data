// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

// Fire one bullet from the ship's muzzle.
export const fireBullet = (db: ServiceDatabase) => {
  db.transactions.fireBullet();
};
