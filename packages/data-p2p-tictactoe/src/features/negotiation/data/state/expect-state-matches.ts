// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import { equalsUnordered } from "@adobe/data";
import type { State } from "./state.js";

// Spec-owned tolerant `State` equality, shared by the data/ transform tests and
// the ecs conformance runner. `equalsUnordered` is object key-order independent.
// (Negotiation state is all scalars, so ordering never bites — the shared helper
// is kept to mirror the pattern and stay robust if a collection field is added.)
export const expectStateMatches = (actual: State, expected: State): void => {
  expect(
    equalsUnordered(actual, expected),
    `State mismatch:\n  actual   ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`,
  ).toBe(true);
};
