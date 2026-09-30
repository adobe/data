// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { GameService } from "./game-service.js";

/** No default game: the app must inject one (see {@link GameService}). */
export const create = (): GameService => {
  throw new Error("GameService must be injected: Database.create(plugin, { services: { game } })");
};
