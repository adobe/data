// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Vec2 } from "@adobe/data/math";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

const at = (x: number, y: number): Vec2 => [x, y] as Vec2;

export const cases: readonly ConformanceCase<{ mark: "X" | "O"; x: number; y: number }>[] = [
  {
    name: "records the first cursor position for a peer",
    before: State.create(),
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

describe("State.movePresence", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => {
      expectStateMatches(State.movePresence(before, args), after);
    });
  }
});
