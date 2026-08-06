// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect } from "vitest";
import { equalsUnordered } from "@adobe/data";
import type { State } from "./state.js";

// Spec-owned tolerant `State` equality, shared by the data/ transform tests and
// the ecs conformance runner. Cursor positions are Vec2 (F32 tuples), so numbers
// are quantized onto a shared grid to absorb F32↔f64 storage rounding before the
// key-order-independent `equalsUnordered` compare.
const quantize = (n: number): number => Math.round(Math.fround(n) * 1e6) / 1e6 + 0;

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
