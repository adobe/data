// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import type { State } from "./state.js";

// A vitest asymmetric matcher (`expect.any(...)`): honored on the EXPECTED side so
// a case can assert "any number" for a value it does not pin. This game exposes no
// ecs-minted ids in its `State` (bullets/asteroids are pure value types), so no
// case actually needs one — but the matcher path is kept so the comparison is the
// single matcher-aware oracle the rules describe.
const isMatcher = (value: unknown): value is { asymmetricMatch(actual: unknown): boolean } =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { asymmetricMatch?: unknown }).asymmetricMatch === "function";

// Collapse F32↔f64 storage rounding (ecs columns are F32, the spec authors f64)
// AND trig epsilon (a quadrant `cos`/`sin` yields ~3e-15 where a case authors 0)
// onto a small grid so float noise compares equal. `Math.fround` collapses the
// F32 rounding; rounding to 1e-2 (well under any real off-by-a-unit bug at this
// game's magnitudes) collapses the trig epsilon. `+ 0` normalises `-0` to `0`.
const quantize = (n: number): number => Math.round(Math.fround(n) * 100) / 100 + 0;

// Tolerant structural match honoring asymmetric matchers and float precision, with
// arrays compared IN ORDER — correct for the ordered pairs this game is built from
// (`Vec2` position/velocity, whose two components are positional, not a bag). Bags
// of entities compare with `matchesUnordered` below, not here.
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

// Multiset (order-independent) match for the entity COLLECTIONS (`bullets`,
// `asteroids`). The ecs materialises these in nondeterministic row order —
// archetype hole-fills, the broad-phase scan, and split-child spawn order all vary
// — and, unlike todo's display-ordered list, they carry no display order and no
// stable key exposed in `State`, so they are genuine bags. Each element is still
// compared with the ordered, matcher-aware `matches` (so its `Vec2`s stay
// positional). Greedy pairing is sufficient for concrete values.
const matchesUnordered = (actual: readonly unknown[], expected: readonly unknown[]): boolean => {
  if (actual.length !== expected.length) return false;
  const used = new Array(actual.length).fill(false);
  return expected.every((exp) => {
    const index = actual.findIndex((act, i) => !used[i] && matches(act, exp));
    if (index < 0) return false;
    used[index] = true;
    return true;
  });
};

// Spec-owned tolerant `State` equality, shared by the data/ transform spec test
// and the ecs conformance runners. Scalars and the ordered `Vec2`/`ship` fields
// compare in order; the entity bags (`bullets`, `asteroids`) compare as multisets.
// No separate id-ignoring variant — this one comparison serves both the pure spec
// and every ecs surface.
export const expectStateMatches = (actual: State, expected: State): void => {
  const ok =
    matches(actual.bounds, expected.bounds) &&
    matches(actual.ship, expected.ship) &&
    matches(actual.score, expected.score) &&
    matches(actual.lives, expected.lives) &&
    matches(actual.wave, expected.wave) &&
    matchesUnordered(actual.bullets, expected.bullets) &&
    matchesUnordered(actual.asteroids, expected.asteroids);
  expect(
    ok,
    `State mismatch:\n  actual   ${JSON.stringify(actual)}\n  expected ${JSON.stringify(expected)}`,
  ).toBe(true);
};

// The same tolerant, matcher-aware comparison for any single value — the analog of
// todo's `expectMatches`, used where a compared value is not a whole `State`.
export const expectMatches = (actual: unknown, expected: unknown): void => {
  expect(matches(actual, expected), `mismatch:\n  actual ${JSON.stringify(actual)}`).toBe(true);
};
