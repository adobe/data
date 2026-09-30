// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Motion } from "./motion.js";

describe("Motion.advance", () => {
  it("moves position by velocity * dt", () => {
    expect(Motion.advance([0, 0], [10, -4], 0.5)).toEqual([5, -2]);
  });

  it("is a no-op at rest", () => {
    expect(Motion.advance([3, 7], [0, 0], 1)).toEqual([3, 7]);
  });
});
