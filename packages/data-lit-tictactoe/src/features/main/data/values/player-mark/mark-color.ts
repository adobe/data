// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { PlayerMark } from "./player-mark.js";

/**
 * Visual identity colour for each mark. Used by HUDs, badges, and overlays
 * (e.g. the P2P presence cursors) — anything that needs a per-mark accent.
 */
export const markColor: Record<PlayerMark, string> = {
    X: "#6c63ff",
    O: "#ff6363",
};
