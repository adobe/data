// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Ship } from "./ship.js";

describe("Ship.turn", () => {
  it("rotates by turnRate * direction * dt", () => {
    expect(Ship.turn(0, 1, 0.5)).toBeCloseTo(Ship.turnRate * 0.5);
    expect(Ship.turn(0, -1, 0.5)).toBeCloseTo(-Ship.turnRate * 0.5);
  });

  it("holds heading when direction is zero", () => {
    expect(Ship.turn(1.2, 0, 1)).toBe(1.2);
  });
});
