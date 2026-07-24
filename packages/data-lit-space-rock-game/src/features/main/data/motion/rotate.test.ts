// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Motion } from "./motion.js";

describe("Motion.rotate", () => {
  it("rotates a quarter turn counter-clockwise", () => {
    const [x, y] = Motion.rotate([1, 0], Math.PI / 2);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1);
  });

  it("leaves a vector unchanged at zero angle", () => {
    const [x, y] = Motion.rotate([2, -3], 0);
    expect(x).toBeCloseTo(2);
    expect(y).toBeCloseTo(-3);
  });

  it("preserves length", () => {
    const [x, y] = Motion.rotate([3, 4], 0.9);
    expect(Math.hypot(x, y)).toBeCloseTo(5);
  });
});
