// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

// Refill a cleared field with a randomized wave drawn from the `random` service
// (a no-op while asteroids remain).
export const spawnRandomWave = (db: ServiceDatabase) => {
  db.transactions.refillWave({ random: db.services.random });
};
