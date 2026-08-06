// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../../core-database/core-database.js";

/**
 * Store the constructed (non-serializable) game database handle and transition
 * to the live game. The visible phase / connection change is exactly the pure
 * `State.enterGame` transform — see `set-game-db.test.ts`, which conforms this
 * transaction to it by passing `gameDb: null` (the handle is invisible to the
 * spec's serializable `State`).
 */
export const setGameDb = (t: CoreDatabase.Store, { gameDb }: { gameDb: unknown }) => {
  t.resources.gameDb = gameDb;
  t.resources.phase = "game";
  t.resources.connection = "connected";
};
