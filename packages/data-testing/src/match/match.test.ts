// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { matches, ref, anyNumber, anyString } from "./public.js";

describe("Match.matches", () => {
  it("compares plain structures deeply", () => {
    expect(matches({ a: 1, b: [2, 3] }, { a: 1, b: [2, 3] })).toBe(true);
    expect(matches({ a: 1 }, { a: 2 })).toBe(false);
    expect(matches({ a: 1, b: 2 }, { a: 1 })).toBe(false); // extra key on actual
  });

  it("absorbs F32/f64 and trig float noise onto the tolerance grid", () => {
    expect(matches(Math.fround(0.1), 0.1)).toBe(true);
    expect(matches(3e-15, 0)).toBe(true);
    expect(matches(0.5, 0.5001)).toBe(true); // within 0.01
    expect(matches(0.5, 0.52)).toBe(false); // outside 0.01
    expect(matches(-0, 0)).toBe(true);
  });

  it("honors anyNumber / anyString and vitest-style asymmetric matchers", () => {
    expect(matches({ id: 42, name: "x" }, { id: anyNumber, name: anyString })).toBe(true);
    expect(matches({ id: "no" }, { id: anyNumber })).toBe(false);
    expect(matches(7, expect.any(Number))).toBe(true);
  });

  it("treats id like any other property", () => {
    // An id a case cares about is pinned and compared like any field.
    expect(matches({ id: 7 }, { id: 7 })).toBe(true);
    expect(matches({ id: 7 }, { id: 8 })).toBe(false);
    // An unmentioned id is an extra key and fails, exactly like any extra key.
    expect(matches({ id: 7, name: "a" }, { name: "a" })).toBe(false);
    expect(matches({ extra: 1, name: "a" }, { name: "a" })).toBe(false);
  });

  it("compares arrays in order, Sets and Maps order-independently", () => {
    expect(matches([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(matches([1, 2, 3], [3, 2, 1])).toBe(false);

    expect(matches(new Set([1, 2, 3]), new Set([3, 1, 2]))).toBe(true);
    expect(matches(new Set([1, 2]), new Set([1, 2, 3]))).toBe(false);
    expect(matches(new Set([1, 2]), [1, 2])).toBe(false); // Set ≠ Array

    // Set of entities: content pairs order-independently.
    expect(
      matches(new Set([{ x: 1 }, { x: 2 }]), new Set([{ x: 2 }, { x: 1 }])),
    ).toBe(true);

    // Map entries pair by (meaningful) key regardless of insertion order.
    expect(matches(new Map([["a", 1], ["b", 2]]), new Map([["b", 2], ["a", 1]]))).toBe(true);
    expect(matches(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
    expect(matches(new Map([["a", 1]]), new Map([["b", 1]]))).toBe(false);
  });

  describe("ref — id correspondence up to renaming", () => {
    it("binds a label to the first actual and requires later ones to match", () => {
      // Same ecs id in two places must be the same actual value.
      expect(matches({ sel: 100, items: [{ id: 100 }] }, { sel: ref("a"), items: [{ id: ref("a") }] })).toBe(
        true,
      );
      // A dangling reference (sel points at an id no item has) fails.
      expect(matches({ sel: 999, items: [{ id: 100 }] }, { sel: ref("a"), items: [{ id: ref("a") }] })).toBe(
        false,
      );
    });

    it("is injective — two labels cannot bind the same actual", () => {
      expect(matches([5, 6], [ref("a"), ref("b")])).toBe(true);
      expect(matches([5, 5], [ref("a"), ref("b")])).toBe(false);
    });

    it("corresponds across an unordered Set boundary", () => {
      // `sel` points at the entity that has x:1 — whatever ecs id that entity got.
      // The referenced entity lives in a Set (nondeterministic order), so the
      // pairing must try candidates until the ref binding is globally consistent.
      const actual = { sel: 100, items: new Set([{ id: 100, x: 1 }, { id: 200, x: 2 }]) };
      const expected = {
        sel: ref("a"),
        items: new Set([{ id: ref("a"), x: 1 }, { id: anyNumber, x: 2 }]),
      };
      expect(matches(actual, expected)).toBe(true);

      // `sel` points at an id no item carries → no consistent pairing exists.
      const dangling = { sel: 999, items: new Set([{ id: 100, x: 1 }, { id: 200, x: 2 }]) };
      expect(matches(dangling, expected)).toBe(false);
    });
  });
});
