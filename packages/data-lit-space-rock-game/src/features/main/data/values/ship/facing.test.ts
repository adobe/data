// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Ship } from "./ship.js";

describe("Ship.facing", () => {
  it("points along +x at angle 0", () => {
    const [x, y] = Ship.facing(0);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
  });

  it("is a unit vector at any angle", () => {
    const [x, y] = Ship.facing(2.3);
    expect(Math.hypot(x, y)).toBeCloseTo(1);
  });
});
