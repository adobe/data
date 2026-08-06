// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PlayerMark } from "data-lit-tictactoe";
import { Cursors } from "../cursors/cursors.js";
import type { State } from "./state.js";

/**
 * Update the given peer's cursor position. `mark` identifies the peer — in the
 * ecs implementation it is injected from the transaction's `userId` (the peer's
 * assigned mark), so each peer only ever writes its own entry.
 */
export const movePresence = <T extends State>(
  state: T,
  { mark, x, y }: { mark: PlayerMark; x: number; y: number },
): T => ({
  ...state,
  cursors: Cursors.set(state.cursors, mark, x, y),
});
