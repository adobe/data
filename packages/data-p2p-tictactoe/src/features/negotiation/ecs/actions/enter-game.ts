// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../services/service-database.js";

// Commits `setGameDb` (whose visible phase / connection change is exactly the spec's
// `enterGame`), keeping the current game-database handle.
export const enterGame = (db: ServiceDatabase) => {
  db.transactions.setGameDb({ gameDb: db.resources.gameDb });
};
