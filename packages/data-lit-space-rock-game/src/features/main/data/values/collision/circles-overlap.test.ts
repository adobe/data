// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Collision } from "./collision.js";

describe("Collision.circlesOverlap", () => {
  it("overlaps when centres are within the summed radii", () => {
    expect(Collision.circlesOverlap([0, 0], 5, [8, 0], 5)).toBe(true);
  });

  it("does not overlap when centres are farther than the summed radii", () => {
    expect(Collision.circlesOverlap([0, 0], 1, [10, 0], 1)).toBe(false);
  });

  it("touches exactly at the boundary (inclusive)", () => {
    expect(Collision.circlesOverlap([0, 0], 3, [0, 10], 7)).toBe(true);
  });
});
