// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Hazard } from "./hazard.js";

describe("Hazard.coversAt", () => {
  it("includes the left edge", () => {
    expect(Hazard.coversAt(2, 3, 2)).toBe(true);
  });
  it("includes a point inside the span", () => {
    expect(Hazard.coversAt(2, 3, 4.9)).toBe(true);
  });
  it("excludes the right edge (half-open span)", () => {
    expect(Hazard.coversAt(2, 3, 5)).toBe(false);
  });
  it("excludes a point left of the span", () => {
    expect(Hazard.coversAt(2, 3, 1.9)).toBe(false);
  });
});
