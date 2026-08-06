// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import type { State } from "./state.js";

// A vitest asymmetric matcher (`expect.any(...)`, see `matchers.ts`): honored on
// the EXPECTED side so a case can assert "any number" for a value it does not pin.
const isMatcher = (value: unknown): value is { asymmetricMatch(actual: unknown): boolean } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function";

// Collapse F32↔f64 storage rounding (the ecs `order` column is F32, the spec
// authors integers) onto a small grid so float noise compares equal. `+ 0`
// normalises `-0` to `0`.
const quantize = (n: number): number => Math.round(Math.fround(n) * 100) / 100 + 0;

// Tolerant structural match honoring asymmetric matchers, float precision, and
// order-sensitive arrays (`toState` reads todos in display order, so position is
// significant — this is what actually verifies a reorder). Exported so it can
// back other conformance comparisons (e.g. computed values).
export const matches = (actual: unknown, expected: unknown): boolean => {
  if (isMatcher(expected)) return expected.asymmetricMatch(actual);
  if (typeof expected === "number" && typeof actual === "number") {
    return quantize(actual) === quantize(expected);
  }
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

// Spec-owned tolerant `State` equality, shared by the data/ transform tests and
// the ecs conformance runners. `after` may use asymmetric matchers
// (`anyNumber` for ids the ecs assigns from its own id-space), so this one
// comparison serves both the pure spec and the ecs projection — no separate
// id-ignoring variant is needed.
export const expectStateMatches = (actual: State, expected: State): void => {
  expectMatches(actual, expected);
};

// The same tolerant, matcher-aware comparison for any value — used by derivation
// spec tests and computed conformance, where the compared value is a `Todo[]` or
// a scalar rather than a whole `State`.
export const expectMatches = (actual: unknown, expected: unknown): void => {
  expect(matches(actual, expected), `mismatch:\n  actual ${JSON.stringify(actual)}`).toBe(true);
};
