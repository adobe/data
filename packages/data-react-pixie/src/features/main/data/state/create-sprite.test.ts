// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it } from "vitest";
import type { Vec2 } from "@adobe/data/math";
import type { SpriteKind } from "../sprite-kind/sprite-kind.js";
import { State } from "./state.js";
import type { ConformanceCase } from "./conformance-case.js";
import { expectStateMatches } from "./expect-state-matches.js";

type Args = { readonly position: Vec2; readonly rotation?: number; readonly kind: SpriteKind };

// Appends one sprite with the next id (max existing + 1), defaulting rotation to
// 0 and hovered/active to false; existing sprites are untouched.
export const cases: readonly ConformanceCase<Args>[] = [
  {
    name: "appends the first sprite (id 1) to an empty scene",
    before: { sprites: [], filter: "none" },
    args: { position: [100, 100], kind: "bunny" },
    after: {
      sprites: [{ id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false }],
      filter: "none",
    },
  },
  {
    name: "appends a fox with the next id and an explicit rotation",
    before: {
      sprites: [{ id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false }],
      filter: "sepia",
    },
    args: { position: [300, 200], rotation: 1, kind: "fox" },
    after: {
      sprites: [
        { id: 1, position: [100, 100], rotation: 0, kind: "bunny", hovered: false, active: false },
        { id: 2, position: [300, 200], rotation: 1, kind: "fox", hovered: false, active: false },
      ],
      filter: "sepia",
    },
  },
];

describe("State.createSprite", () => {
  for (const { name, before, args, after } of cases) {
    it(name, () => expectStateMatches(State.createSprite(before, args), after));
  }
});
