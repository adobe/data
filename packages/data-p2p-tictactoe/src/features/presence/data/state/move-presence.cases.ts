// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { Conformance } from "@adobe/data-testing";
import type { State } from "./state.js";
import type { movePresence } from "./move-presence.js";

const at = (x: number, y: number): Vec2 => [x, y] as Vec2;

// Inert cases for `movePresence`. `mark` is a plain data arg (the peer's mark); on the
// ecs side the escape-hatch runner seeds it as the transaction `userId` via
// `seedContext` (see conformance/actions.test.ts). `before` is a delta over
// `State.create()`; cursor positions are `Vec2` tuples compared in order.
export const cases: Conformance.SpecCases<State, typeof movePresence> = {
  cases: [
    {
      name: "records the first cursor position for a peer",
      before: {},
      args: { mark: "X", x: 0.5, y: 0.25 },
      after: { cursors: { X: at(0.5, 0.25) } },
    },
    {
      name: "updates one peer's cursor while preserving the other's",
      before: { cursors: { X: at(0.5, 0.25) } },
      args: { mark: "O", x: 0.75, y: 0.5 },
      after: { cursors: { X: at(0.5, 0.25), O: at(0.75, 0.5) } },
    },
  ],
};
