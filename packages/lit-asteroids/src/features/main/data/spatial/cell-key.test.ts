// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Spatial } from "./spatial.js";

describe("Spatial.cellKey", () => {
  it("maps positions in the same cell to the same key", () => {
    expect(Spatial.cellKey([5, 5], 32)).toBe(Spatial.cellKey([20, 30], 32));
  });

  it("maps positions in different cells to different keys", () => {
    expect(Spatial.cellKey([5, 5], 32)).not.toBe(Spatial.cellKey([40, 5], 32));
    expect(Spatial.cellKey([5, 5], 32)).not.toBe(Spatial.cellKey([5, 40], 32));
  });

  it("is stable at the cell boundary", () => {
    // x = 32 falls in cell 1, x = 31.999 in cell 0.
    expect(Spatial.cellKey([32, 0], 32)).toBe(Spatial.cellKey([63, 0], 32));
    expect(Spatial.cellKey([32, 0], 32)).not.toBe(Spatial.cellKey([31, 0], 32));
  });

  it("distinguishes the x and y axes (no packing collision)", () => {
    // cell (1,0) and (0,1) must not collapse to the same key.
    expect(Spatial.cellKey([40, 0], 32)).not.toBe(Spatial.cellKey([0, 40], 32));
  });

  it("returns a non-negative U32 for negative coordinates", () => {
    const key = Spatial.cellKey([-10, -10], 32);
    expect(key).toBeGreaterThanOrEqual(0);
    expect(key).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(key)).toBe(true);
  });
});
