// © 2026 Adobe. MIT License. See /LICENSE for details.

// The conformed functions of this feature — every pure transform and derivation the
// spec verifies, and nothing else (helpers like `create`, `samples` are deliberately
// absent). Its keys ARE the conformance surface: the manifest's coverage guard
// (`Conformance.feature`) requires exactly one `*.cases.ts` module per key here, so
// adding a transform without cases — or cases without a transform — fails to compile.
// This is a per-feature, local barrel (not a cross-feature registry), authored where
// the transforms live.
export { playMove } from "./play-move.js";
export { restartGame } from "./restart-game.js";
export { currentPlayer } from "./current-player.js";
