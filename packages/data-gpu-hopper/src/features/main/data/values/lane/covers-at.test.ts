// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Lane } from "./lane.js";

describe("Lane.coversAt", () => {
  it("includes the left edge", () => {
    expect(Lane.coversAt(2, 3, 2)).toBe(true);
  });
  it("includes a point inside the span", () => {
    expect(Lane.coversAt(2, 3, 4.9)).toBe(true);
  });
  it("excludes the right edge (half-open span)", () => {
    expect(Lane.coversAt(2, 3, 5)).toBe(false);
  });
  it("excludes a point left of the span", () => {
    expect(Lane.coversAt(2, 3, 1.9)).toBe(false);
  });
});
