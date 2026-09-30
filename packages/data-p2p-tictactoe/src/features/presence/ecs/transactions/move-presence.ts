// © 2026 Adobe. MIT License. See /LICENSE for details.
import { PlayerMark } from "data-lit-tictactoe";
import { Cursors } from "../../data/values/cursors/cursors.js";
import type { CoreDatabase } from "../core/core-database.js";

/**
 * Update the calling peer's cursor position. Driven as a never-ending
 * async-generator transaction by the `trackPresence` action — each yield applies
 * as a transient (never committed) envelope. Reads `t.userId` as a `PlayerMark`
 * so each peer only writes its own cursor entry; foreign or unset `userId`s are
 * ignored.
 */
export const movePresence = (t: CoreDatabase.Store, { x, y }: { x: number; y: number }) => {
  if (!PlayerMark.is(t.userId)) return;
  t.resources.cursors = Cursors.set(t.resources.cursors, t.userId, x, y);
};
