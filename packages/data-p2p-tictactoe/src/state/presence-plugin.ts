// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Vec2 } from "@adobe/data/math";

/**
 * Optional presence plugin. Tracks each player's cursor position in
 * normalised coordinates `[0..1, 0..1]` relative to the overlay element.
 *
 * Combine with `tictactoePlugin` at the sample level:
 * ```ts
 * const gamePlugin = Database.Plugin.combine(tictactoePlugin, presencePlugin);
 * ```
 *
 * The `movePresence` transaction reads `t.userId` to decide which cursor
 * resource to update. In the Tic-Tac-Toe sample, userId "X" → `cursorX`,
 * userId "O" → `cursorO`.
 *
 * This plugin lives in `data-p2p-tictactoe`, not in `data-lit-tictactoe`,
 * because presence is a P2P-specific concern — standalone / AI play has no
 * remote cursors to track.
 */
export const presencePlugin = Database.Plugin.create({
    resources: {
        cursorX: { default: null as Vec2 | null },
        cursorO: { default: null as Vec2 | null },
    },
    transactions: {
        /**
         * Update the calling peer's cursor position. Uses `t.userId` to key
         * the update so each peer only writes its own cursor. Intended to be
         * driven as a never-ending async-generator transaction (see
         * `usePointerObserve` + `Observe.toAsyncGenerator` pattern).
         */
        movePresence(t, args: { x: number; y: number }) {
            if (t.userId === "X") {
                t.resources.cursorX = [args.x, args.y];
            } else if (t.userId === "O") {
                t.resources.cursorO = [args.x, args.y];
            }
        },
    },
});
