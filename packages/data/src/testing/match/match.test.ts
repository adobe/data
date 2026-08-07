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

  it("compares arrays in order by default, as multisets when named", () => {
    expect(matches([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(matches([1, 2, 3], [3, 2, 1])).toBe(false);
    const opts = { unordered: new Set(["bag"]) };
    expect(matches({ bag: [1, 2, 3] }, { bag: [3, 1, 2] }, opts)).toBe(true);
    expect(matches({ bag: [1, 2] }, { bag: [1, 2, 3] }, opts)).toBe(false);
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
  });
});
