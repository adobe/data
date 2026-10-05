// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Database } from "@adobe/data/ecs";
import { TictactoeGameDatabase } from "data-lit-tictactoe";
import { MainService as PresenceMainService } from "../features/presence/ecs/main-service.js";

// The synced game database's schema: the tic-tac-toe game plus the presence peer
// plugin. The negotiation database is separate and local-only.
const gameSchemaPlugin = Database.Plugin.combine(TictactoeGameDatabase.plugin, PresenceMainService.plugin);

export namespace GameSchema {
  export const plugin = gameSchemaPlugin;
}
