// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// The app-facing realization of `State.restartGame`: no outside capability, so it
// commits the scoreboard tally + board reset through a single transaction.
export const restartGame = (db: ServiceDatabase) => {
  db.transactions.restartGame();
};
