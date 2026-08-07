// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import type { State } from "./state.js";

// A vitest asymmetric matcher (`expect.any(...)`): honored on the EXPECTED side
// so a case can assert "any value" for something it does not pin. This feature's
// `State` is entirely scalar resources (no ecs-minted ids), so no case actually
// uses one today — but the comparison stays matcher-aware so it backs the shared
// spec/computed comparisons uniformly across features (see `matchers.ts` note).
const isMatcher = (value: unknown): value is { asymmetricMatch(actual: unknown): boolean } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function";

// Tolerant structural match honoring asymmetric matchers and comparing arrays
// **in order** — the `log` trail is chronological, so position is significant.
// Exported so it can back other conformance comparisons (e.g. derivation values).
export const matches = (actual: unknown, expected: unknown): boolean => {
  if (isMatcher(expected)) return expected.asymmetricMatch(actual);
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((exp, index) => matches(actual[index], exp));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const expectedKeys = Object.keys(expected);
    const actualKeys = Object.keys(actual as object);
    if (expectedKeys.length !== actualKeys.length) return false;
    return expectedKeys.every((key) =>
      matches((actual as Record<string, unknown>)[key], (expected as Record<string, unknown>)[key]),
    );
  }
  return Object.is(actual, expected);
};

// Spec-owned tolerant `State` equality, shared by the data/ spec test and the ecs
// conformance runners. Every field is a scalar held in a single resource slot
// (plain JS storage — no typed-buffer rounding, no archetype hole-fill), so the
// projection is id-free; the matcher path still lets `after`/`value` stay open
// where a future field warranted it.
export const expectStateMatches = (actual: State, expected: State): void => {
  expectMatches(actual, expected);
};

// The same tolerant, matcher-aware comparison for any value — used by the spec
// aggregator for derivation cases, where the compared value is not a whole `State`.
export const expectMatches = (actual: unknown, expected: unknown): void => {
  expect(matches(actual, expected), `mismatch:\n  actual ${JSON.stringify(actual)}`).toBe(true);
};
