// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import type { State } from "./state.js";

// A vitest asymmetric matcher (`expect.any(...)`): honored on the EXPECTED side so
// a case can assert "any number" for a value it does not pin. Presence's `State`
// keys cursors by the peer's `PlayerMark` (no ecs-minted ids), so no case needs
// one today — but the comparison stays matcher-aware to match the shared pattern.
const isMatcher = (value: unknown): value is { asymmetricMatch(actual: unknown): boolean } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function";

// Cursor positions are `Vec2` (F32 tuples), so numbers are quantized onto a shared
// grid to absorb F32↔f64 storage rounding before comparison. `+ 0` normalises `-0`.
const quantize = (n: number): number => Math.round(Math.fround(n) * 1e6) / 1e6 + 0;

// Tolerant structural match honoring asymmetric matchers, float precision, and
// order-sensitive arrays (cursor tuples). Objects compare by key set, so the
// `cursors` map is order-independent. Exported so it can back other comparisons.
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

// Spec-owned tolerant `State` equality, shared by the data/ transform spec and the
// ecs conformance runners. `after` may use asymmetric matchers, so this one
// comparison serves both the pure spec and the ecs projection.
export const expectStateMatches = (actual: State, expected: State): void => {
  expectMatches(actual, expected);
};

// The same tolerant, matcher-aware comparison for any value.
export const expectMatches = (actual: unknown, expected: unknown): void => {
  expect(matches(actual, expected), `mismatch:\n  actual ${JSON.stringify(actual)}`).toBe(true);
};
