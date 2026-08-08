// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ServiceDatabase } from "../../service-database/service-database.js";

// App-facing realization of `State.enterGame`: reuses the `setGameDb` transaction
// (a differently-named transaction whose visible phase/connection effect is
// exactly `enterGame`), preserving the current game-database handle read
// synchronously from the store. There is no same-named transaction — transactions
// are the looser layer.
export const enterGame = (db: ServiceDatabase) => {
  db.transactions.setGameDb({ gameDb: db.resources.gameDb });
};
