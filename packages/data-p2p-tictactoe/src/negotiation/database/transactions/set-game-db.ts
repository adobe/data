// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { CoreDatabase } from "../core-database.js";

/**
 * Store the constructed game DB and transition to the game phase. Called by
 * the negotiation service after sync transports are wired and the WebRTC
 * channel is open.
 */
export const setGameDb = (t: CoreDatabase.Store, { gameDb }: { gameDb: unknown }) => {
  t.resources.gameDb = gameDb;
  t.resources.phase = "game";
  t.resources.connection = "connected";
};
