// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core/core-database.js";

/**
 * Store the constructed (non-serializable) game database handle and transition
 * to the live game. Its visible phase / connection change is the spec's
 * `enterGame`, conformed through the `enterGame` action.
 */
export const setGameDb = (t: CoreDatabase.Store, { gameDb }: { gameDb: unknown }) => {
  t.resources.gameDb = gameDb;
  t.resources.phase = "game";
  t.resources.connection = "connected";
};
