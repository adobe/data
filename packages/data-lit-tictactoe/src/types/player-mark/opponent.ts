// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PlayerMark } from "./player-mark";

/**
 * Maps each `PlayerMark` to its opponent. Use anywhere code needs to
 * "swap to the other player" without naming members at the call site.
 */
export const opponent: Record<PlayerMark, PlayerMark> = {
    X: "O",
    O: "X",
};
