// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Sprite } from "../sprite/sprite.js";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

type Args = { readonly id: number };

const bunny: Sprite = { id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false };
const activeFox: Sprite = { id: 2, position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: true };

// Flips the addressed sprite's `active` flag; a no-op for an unknown id.
export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "toggles a sprite from inactive to active",
    before: { sprites: [bunny, activeFox], filter: "none" },
    args: { id: 1 },
    after: { sprites: [{ ...bunny, active: true }, activeFox], filter: "none" },
  },
  {
    name: "toggles a sprite from active to inactive",
    before: { sprites: [bunny, activeFox], filter: "none" },
    args: { id: 2 },
    after: { sprites: [bunny, { ...activeFox, active: false }], filter: "none" },
  },
  {
    name: "is a no-op for an unknown id",
    before: { sprites: [bunny, activeFox], filter: "none" },
    args: { id: 99 },
    after: { sprites: [bunny, activeFox], filter: "none" },
  },
];

describe("State.toggleSpriteActive", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.toggleSpriteActive(before, args), after));
  }
});
