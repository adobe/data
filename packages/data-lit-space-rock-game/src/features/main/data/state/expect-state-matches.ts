// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import { equalsUnordered } from "@adobe/data";
import type { State } from "./state.js";

// Spec-owned tolerant `State` equality, shared by the data/ transform tests
// (f64, trig epsilon) and the ecs conformance runner (F32 columns, one storage
// rounding off the f64 oracle). Two orthogonal concerns, kept separate:
//
//   precision — normalise every number on both sides onto a shared grid, so a
//     value that differs only by F32↔f64 storage rounding OR by trig epsilon
//     (a quadrant `cos`/`sin` yields ~3e-15 where a case authors 0) compares
//     equal. `Math.fround` collapses the F32 rounding; rounding to 1e-2
//     (the tolerance the old `toBeCloseTo(_, 2)` used — far under any real
//     off-by-a-unit bug at this game's magnitudes) collapses the trig epsilon.
//     `+ 0` normalises `-0` to `0`, since the compare below distinguishes them.
//   ordering — `equalsUnordered` compares arrays as MULTISETS (archetype
//     hole-fills and broad-phase order make row order nondeterministic) and is
//     object key-order independent.
const quantize = (n: number): number => Math.round(Math.fround(n) * 100) / 100 + 0;

const normalize = (value: unknown): unknown => {
  if (typeof value === "number") return quantize(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, normalize(v)]));
  }
  return value;
};

export const expectStateMatches = (actual: State, expected: State): void => {
  const a = normalize(actual);
  const b = normalize(expected);
  expect(
    equalsUnordered(a, b),
    `State mismatch:\n  actual   ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`,
  ).toBe(true);
};
