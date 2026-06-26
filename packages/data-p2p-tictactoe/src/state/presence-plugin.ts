// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import type { Vec2 } from "@adobe/data/math";
import { PlayerMark } from "data-lit-tictactoe";

/**
 * Optional presence plugin. Tracks each connected peer's cursor position
 * in normalised coordinates `[0..1, 0..1]` relative to the overlay element,
 * keyed by `PlayerMark`. Entries appear when a peer first reports a position
 * and may be absent for peers that have never moved their cursor.
 *
 * Combine with `tictactoePlugin` at the sample level:
 * ```ts
 * const gamePlugin = Database.Plugin.combine(tictactoePlugin, presencePlugin);
 * ```
 *
 * `movePresence` reads `t.userId` as a `PlayerMark` so each peer only
 * writes its own cursor entry; foreign or unset `userId`s are ignored.
 *
 * This plugin lives in `data-p2p-tictactoe`, not in `data-lit-tictactoe`,
 * because presence is a P2P-specific concern — standalone / AI play has no
 * remote cursors to track.
 */
export const presencePlugin = Database.Plugin.create({
    resources: {
        cursors: { default: {} as Partial<Record<PlayerMark, Vec2>> },
    },
    transactions: {
        /**
         * Update the calling peer's cursor position. Driven as a never-ending
         * async-generator transaction by the `trackPresence` action — each
         * yield applies as a transient (never committed) envelope.
         */
        movePresence(t, args: { x: number; y: number }) {
            if (!PlayerMark.is(t.userId)) return;
            t.resources.cursors = { ...t.resources.cursors, [t.userId]: [args.x, args.y] as Vec2 };
        },
    },
    actions: {
        /**
         * Pump a stream of normalised cursor positions into the synced
         * presence transient. The UI passes a positions generator factory
         * (sourced from local pointer events) and the action owns the
         * fire-and-forget streaming transaction, so the container never
         * touches the full transactional surface.
         */
        trackPresence: (db, positions: () => AsyncGenerator<{ x: number; y: number }>) => {
            db.transactions.movePresence(positions).catch(() => undefined);
        },
    },
});
