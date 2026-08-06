// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Sprite } from "../sprite/sprite.js";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

type Args = { readonly id: number; readonly active: boolean };

const bunny: Sprite = { id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false };
const fox: Sprite = { id: 2, position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false };

// Sets the addressed sprite's `active` flag; a no-op for an unknown id.
export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "sets active true on the addressed sprite only",
    before: { sprites: [bunny, fox], filter: "none" },
    args: { id: 2, active: true },
    after: { sprites: [bunny, { ...fox, active: true }], filter: "none" },
  },
  {
    name: "is a no-op for an unknown id",
    before: { sprites: [bunny, fox], filter: "none" },
    args: { id: 99, active: true },
    after: { sprites: [bunny, fox], filter: "none" },
  },
];

describe("State.setSpriteActive", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.setSpriteActive(before, args), after));
  }
});
