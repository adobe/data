// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import type { GameService } from "./game-service.js";

/** Fake {@link GameService}: an empty game plugin, each role playing as its own name. */
export const createFake = (): GameService => ({
  serviceName: "game",
  plugin: Database.Plugin.create({}),
  assignUserId: (role) => role,
});
