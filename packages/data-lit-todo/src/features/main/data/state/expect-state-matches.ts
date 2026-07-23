// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import { equalsUnordered } from "@adobe/data";
import type { State } from "./state.js";

// Spec-owned tolerant `State` equality, shared by the data/ transform tests and
// the ecs conformance runner. Two orthogonal concerns, kept separate:
//
//   precision — normalise every number on both sides onto a shared grid so a
//     value that differs only by F32↔f64 storage rounding (the ecs `order`
//     column is F32, the spec authors plain integers) compares equal.
//     `Math.fround` collapses the F32 rounding; rounding to 1e-2 collapses any
//     residue. `+ 0` normalises `-0` to `0`, which the compare below distinguishes.
//   ordering — `equalsUnordered` compares arrays as MULTISETS (archetype
//     hole-fills make row order nondeterministic) and is object key-order
//     independent. Each todo carries its `id`, so the multiset still pins which
//     todos exist with which `complete` flag.
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
