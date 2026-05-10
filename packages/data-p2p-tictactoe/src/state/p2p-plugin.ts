// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { gamePlugin } from "./game-plugin.js";
import { negotiationPlugin } from "./negotiation-plugin.js";

/**
 * The combined plugin used for the main database. `gamePlugin` and
 * `negotiationPlugin` are fully independent — neither references the
 * other — so `Database.Plugin.combine` is the right tool here rather
 * than `extends`.
 */
export const p2pPlugin = Database.Plugin.combine(gamePlugin, negotiationPlugin);

export type P2pDatabase = Database.FromPlugin<typeof p2pPlugin>;
