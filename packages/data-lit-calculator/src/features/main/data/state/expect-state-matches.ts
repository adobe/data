// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import { equalsUnordered } from "@adobe/data";
import type { State } from "./state.js";

// Spec-owned tolerant `State` equality, shared by the data/ transform tests and
// the ecs conformance runner. Two orthogonal concerns, kept separate:
//
//   precision — normalise every number on both sides onto a shared grid so a
//     value that differs only by floating-point noise compares equal.
//     `Math.fround` collapses any F32 storage rounding; rounding to 1e-2
//     collapses any residue. `+ 0` normalises `-0` to `0`, which the compare
//     below distinguishes.
//   ordering — `equalsUnordered` is object key-order independent (and compares
//     arrays as multisets). The calculator `State` is a flat record, so this is
//     really just a tolerant deep-equal; kept for parity with the other features.
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
