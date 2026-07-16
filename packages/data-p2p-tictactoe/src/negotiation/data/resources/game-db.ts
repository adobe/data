// © 2026 Adobe. MIT License. See /LICENSE for details.

// The synced game database, populated by the negotiation service after the
// WebRTC channel opens. `unknown` so the plugin stays game-agnostic; consumers
// cast at the render boundary.
export const gameDb = { default: null as unknown, ephemeral: true };
