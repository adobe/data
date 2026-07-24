// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Hazard } from "./hazard.js";

describe("Hazard.nextX", () => {
  it("moves by velocity * dt", () => {
    expect(Hazard.nextX(3, 2, 1, 9)).toBe(5);
  });
  it("wraps a positive overshoot around the board width", () => {
    expect(Hazard.nextX(8, 1, 1, 9)).toBe(0);
  });
  it("wraps a negative velocity back around the right edge", () => {
    expect(Hazard.nextX(0, -1, 1, 9)).toBe(8);
  });
  it("is stationary at dt 0", () => {
    expect(Hazard.nextX(3.5, 4, 0, 9)).toBe(3.5);
  });
});
