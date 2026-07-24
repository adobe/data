// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Hazard } from "./hazard.js";

const car: Hazard = { kind: "car", lane: 1, x: 3, width: 1, velocity: 2 };

describe("Hazard.advance", () => {
  it("moves the left edge by velocity * dt", () => {
    expect(Hazard.advance(car, 1, 9).x).toBe(5);
  });
  it("wraps a positive overshoot around the board width", () => {
    expect(Hazard.advance({ ...car, x: 8 }, 1, 9).x).toBe(1);
  });
  it("wraps a negative velocity back around the right edge", () => {
    expect(Hazard.advance({ ...car, x: 0, velocity: -1 }, 1, 9).x).toBe(8);
  });
  it("leaves every other field untouched", () => {
    expect(Hazard.advance(car, 1, 9)).toMatchObject({ kind: "car", lane: 1, width: 1, velocity: 2 });
  });
});
