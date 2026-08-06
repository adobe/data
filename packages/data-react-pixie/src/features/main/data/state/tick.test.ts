// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Sprite } from "../sprite/sprite.js";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

type Args = { readonly delta: number };

const bunny: Sprite = { id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false };
const fox: Sprite = { id: 2, position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false };

// Every sprite's rotation advances by delta * 0.1.
export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "advances every sprite's rotation by delta * 0.1",
    before: { sprites: [bunny, fox], filter: "none" },
    args: { delta: 10 },
    after: {
      sprites: [
        { ...bunny, rotation: 1 },
        { ...fox, rotation: 2 },
      ],
      filter: "none",
    },
  },
  {
    name: "is a no-op on an empty scene",
    before: { sprites: [], filter: "blur" },
    args: { delta: 5 },
    after: { sprites: [], filter: "blur" },
  },
];

describe("State.tick", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.tick(before, args), after));
  }
});
