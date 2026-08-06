// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Sprite } from "../sprite/sprite.js";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

type Args = { readonly id: number; readonly hovered: boolean };

const bunny: Sprite = { id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false };
const fox: Sprite = { id: 2, position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false };

// Sets the addressed sprite's `hovered` flag; a no-op for an unknown id.
export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "sets hovered true on the addressed sprite only",
    before: { sprites: [bunny, fox], filter: "none" },
    args: { id: 1, hovered: true },
    after: { sprites: [{ ...bunny, hovered: true }, fox], filter: "none" },
  },
  {
    name: "is a no-op for an unknown id",
    before: { sprites: [bunny, fox], filter: "none" },
    args: { id: 99, hovered: true },
    after: { sprites: [bunny, fox], filter: "none" },
  },
];

describe("State.setSpriteHovered", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.setSpriteHovered(before, args), after));
  }
});
