// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { PlayerMark } from "data-lit-tictactoe";
import type { Vec2 } from "@adobe/data/math";
import { Cursors } from "../cursors/cursors.js";
import type { State } from "./state.js";
import type { Conformance } from "./conformance-case.js";

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

const at = (x: number, y: number): Vec2 => [x, y] as Vec2;

// Spec-owned cases, shared with the ecs `movePresence` transaction and action.
export const cases: Conformance<typeof movePresence> = [
  {
    name: "records the first cursor position for a peer",
    before: { cursors: {} },
    args: { mark: "X", x: 0.5, y: 0.25 },
    after: { cursors: { X: at(0.5, 0.25) } },
  },
  {
    name: "updates one peer's cursor while preserving the other's",
    before: { cursors: { X: at(0.5, 0.25) } },
    args: { mark: "O", x: 0.75, y: 0.5 },
    after: { cursors: { X: at(0.5, 0.25), O: at(0.75, 0.5) } },
  },
];
