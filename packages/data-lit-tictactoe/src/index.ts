// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Library entry point for data-lit-tictactoe.
// Consumers (e.g. data-p2p-tictactoe) import from this barrel.

// The assembled feature database: the base game extended with AI agent
// services. Feature-qualified per the cross-feature naming rule so a peer or
// downstream package never collides with another feature's database. Carries
// `.plugin` / `.Store` for consumers that build their own database.
export { FeatureDatabase as TictactoeDatabase } from "./features/main/ecs/feature-database.js";

// The base game database — all game logic (resources, transactions, computed),
// no AI. Combine its `.plugin` with P2P-specific plugins, or reach for
// `TictactoeDatabase` to get the agent-extended assembly.
export { ComputedDatabase as TictactoeGameDatabase } from "./features/main/ecs/computed-database/computed-database.js";

export { Tictactoe } from "./features/main/ui/tictactoe-app/tictactoe-app.js";
export { TictactoeElement } from "./features/main/ui/tictactoe-element.js";

export { BoardState } from "./features/main/data/board-state/board-state.js";
export { PlayerMark } from "./features/main/data/player-mark/player-mark.js";
export { PlayMoveArgs } from "./features/main/data/play-move-args/play-move-args.js";
