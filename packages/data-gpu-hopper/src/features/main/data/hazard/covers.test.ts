// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Hazard } from "./hazard.js";

const log: Hazard = { kind: "log", lane: 5, x: 2, width: 3, velocity: 1 };

describe("Hazard.covers", () => {
  it("includes the left edge", () => {
    expect(Hazard.covers(log, 2)).toBe(true);
  });
  it("includes a point inside the span", () => {
    expect(Hazard.covers(log, 4.5)).toBe(true);
  });
  it("excludes the right edge (half-open span)", () => {
    expect(Hazard.covers(log, 5)).toBe(false);
  });
  it("excludes a point left of the span", () => {
    expect(Hazard.covers(log, 1.9)).toBe(false);
  });
});
