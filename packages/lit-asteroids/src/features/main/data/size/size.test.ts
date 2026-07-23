// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Size } from "./size.js";

describe("Size", () => {
  it("narrows unknown values with its guard", () => {
    expect(Size.is(Size.largest)).toBe(true);
    expect(Size.is("gigantic")).toBe(false);
    expect(Size.is(42)).toBe(false);
  });

  it("has a descriptor entry for every member", () => {
    for (const size of Size.values) {
      expect(typeof Size.radius[size]).toBe("number");
      expect(typeof Size.score[size]).toBe("number");
      expect(typeof Size.splitCount[size]).toBe("number");
    }
  });

  it("chains each tier to the next-smaller until the smallest, which has none", () => {
    const smallest = Size.values.find((s) => Size.smaller[s] === undefined) ?? Size.largest;
    expect(Size.smaller[Size.largest]).not.toBeUndefined();
    expect(Size.splitCount[smallest]).toBe(0);
    // Only the smallest tier is terminal.
    const terminal = Size.values.filter((s) => Size.smaller[s] === undefined);
    expect(terminal).toEqual([smallest]);
  });
});
