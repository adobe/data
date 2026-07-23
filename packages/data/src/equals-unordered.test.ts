// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { equalsUnordered } from "./equals-unordered.js";

describe("equalsUnordered", () => {
  it("matches primitives like deep equality", () => {
    expect(equalsUnordered(1, 1)).toBe(true);
    expect(equalsUnordered("a", "a")).toBe(true);
    expect(equalsUnordered(1, 2)).toBe(false);
    expect(equalsUnordered(null, undefined)).toBe(false);
    expect(equalsUnordered(NaN, NaN)).toBe(true); // Object.is
  });

  it("ignores object key order", () => {
    expect(equalsUnordered({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(equalsUnordered({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(equalsUnordered({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it("ignores array order (multiset)", () => {
    expect(equalsUnordered([1, 2, 3], [3, 1, 2])).toBe(true);
    expect(equalsUnordered([{ x: 1 }, { x: 2 }], [{ x: 2 }, { x: 1 }])).toBe(true);
  });

  it("respects array multiplicity", () => {
    expect(equalsUnordered([1, 1, 2], [1, 2, 2])).toBe(false);
    expect(equalsUnordered([1, 1, 2], [2, 1, 1])).toBe(true);
    expect(equalsUnordered([1, 2], [1, 2, 3])).toBe(false);
  });

  it("recurses through nested order differences", () => {
    const a = { items: [{ tags: ["x", "y"] }, { tags: ["z"] }], meta: { a: 1, b: 2 } };
    const b = { meta: { b: 2, a: 1 }, items: [{ tags: ["z"] }, { tags: ["y", "x"] }] };
    expect(equalsUnordered(a, b)).toBe(true);
  });

  it("distinguishes arrays from objects", () => {
    expect(equalsUnordered([], {})).toBe(false);
  });
});
