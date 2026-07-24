// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import { equalsUnordered } from "@adobe/data";
import type { State } from "./state.js";

// Spec-owned tolerant `State` equality, shared by the data/ transform tests and
// the ecs conformance runner. Two orthogonal concerns, kept separate:
//
//   precision — normalise every number on both sides onto a shared grid, so a
//     value that differs only by F32↔f64 storage rounding compares equal.
//     `Math.fround` collapses the F32 rounding; rounding to 1e-2 collapses any
//     residual epsilon. `+ 0` normalises `-0` to `0`. (The frog's continuous
//     position is a float, so this matters once the ecs stores it as F32.)
//   ordering — `equalsUnordered` compares arrays as MULTISETS (archetype
//     hole-fills make row order nondeterministic) and is object key-order
//     independent.
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
