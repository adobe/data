// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for data-lit-tictactoe.
// Consumers (e.g. data-p2p-tictactoe) import from this barrel.

import { ComputedDatabase } from "./ecs/computed-database.js";
import { ServiceDatabase } from "./ecs/service-database.js";

export { ComputedDatabase } from "./ecs/computed-database.js";
export { ServiceDatabase } from "./ecs/service-database.js";

/**
 * The base game plugin (resources + transactions + computed). Combine with
 * P2P-specific plugins, or extend with AI via {@link ServiceDatabase}. Kept as a
 * value export for consumers that build their own database.
 */
export const tictactoePlugin = ComputedDatabase.plugin;

/** The base game plugin extended with AI agent services. */
export const agentPlugin = ServiceDatabase.plugin;

export { Tictactoe } from "./ui/tictactoe-app/tictactoe-app.js";
export { TictactoeElement } from "./ui/tictactoe-element.js";

export { BoardState } from "./data/board-state/board-state.js";
export { PlayerMark } from "./data/player-mark/player-mark.js";
export { PlayMoveArgs } from "./data/play-move-args/play-move-args.js";
