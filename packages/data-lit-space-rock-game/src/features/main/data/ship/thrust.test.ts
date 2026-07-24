// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Ship } from "./ship.js";

describe("Ship.thrust", () => {
  it("accelerates along the facing direction, adding to existing velocity", () => {
    const [vx, vy] = Ship.thrust([1, 0], 0, 0.5);
    expect(vx).toBeCloseTo(1 + Ship.thrustAccel * 0.5);
    expect(vy).toBeCloseTo(0);
  });

  it("preserves momentum (only adds) — a perpendicular facing keeps the old axis", () => {
    const [vx, vy] = Ship.thrust([10, 0], Math.PI / 2, 0.1);
    expect(vx).toBeCloseTo(10);
    expect(vy).toBeCloseTo(Ship.thrustAccel * 0.1);
  });
});
