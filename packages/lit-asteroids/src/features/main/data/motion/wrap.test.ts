// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Motion } from "./motion.js";

describe("Motion.wrap", () => {
  it("leaves an in-bounds position untouched", () => {
    expect(Motion.wrap([30, 40], [100, 100])).toEqual([30, 40]);
  });

  it("wraps past the far edge back to the near edge", () => {
    expect(Motion.wrap([130, 100], [100, 100])).toEqual([30, 0]);
  });

  it("wraps a negative coordinate forward from the far edge", () => {
    expect(Motion.wrap([-5, -1], [100, 80])).toEqual([95, 79]);
  });
});
