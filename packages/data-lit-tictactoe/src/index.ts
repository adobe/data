// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for data-lit-tictactoe.
// Consumers (e.g. data-p2p-tictactoe) import from this barrel.

import { TictactoeDatabase } from "./database/tictactoe-database.js";
import { AgentDatabase } from "./database/service-database.js";

export { TictactoeDatabase } from "./database/tictactoe-database.js";
export { AgentDatabase } from "./database/service-database.js";

/**
 * The base game plugin (resources + transactions + computed). Combine with
 * P2P-specific plugins, or extend with AI via {@link AgentDatabase}. Kept as a
 * value export for consumers that build their own database.
 */
export const tictactoePlugin = TictactoeDatabase.plugin;

/** The base game plugin extended with AI agent services. */
export const agentPlugin = AgentDatabase.plugin;

export { Tictactoe } from "./elements/tictactoe-app/tictactoe-app.js";
export { TictactoeElement } from "./tictactoe-element.js";

export { BoardState } from "./types/board-state/board-state.js";
export { PlayerMark } from "./types/player-mark/player-mark.js";
export { PlayMoveArgs } from "./types/play-move-args/play-move-args.js";
