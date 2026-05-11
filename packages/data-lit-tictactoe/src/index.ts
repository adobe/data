// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for data-lit-tictactoe.
// Consumers (e.g. data-p2p-tictactoe) import from this barrel.

export { tictactoePlugin } from "./state/tictactoe-plugin.js";
export type { TictactoeDatabase } from "./state/tictactoe-plugin.js";

export { agentPlugin } from "./state/agent-plugin.js";

export { Tictactoe } from "./elements/tictactoe-app/tictactoe-app.js";
export { TictactoeElement } from "./tictactoe-element.js";

export { BoardState } from "./types/board-state/board-state.js";
export { PlayerMark } from "./types/player-mark/player-mark.js";
export { PlayMoveArgs } from "./types/play-move-args/play-move-args.js";
