// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import type { State } from "./state.js";

// Spec-owned `State` equality, shared by the data/ transform tests and the ecs
// conformance runner. Every field is a scalar held in a single resource slot
// (plain JS storage — no typed-buffer rounding, no archetype hole-fill
// reordering), so a strict, order-sensitive deep compare is exactly right:
// the `log` array's chronological order is meaningful and must match.
export const expectStateMatches = (actual: State, expected: State): void => {
  expect(actual).toEqual(expected);
};
