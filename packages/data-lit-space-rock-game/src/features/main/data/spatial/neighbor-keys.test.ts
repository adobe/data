// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Spatial } from "./spatial.js";

describe("Spatial.neighborKeys", () => {
  it("returns the 3×3 block of distinct cell ids", () => {
    const keys = Spatial.neighborKeys([100, 100], 32);
    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(9);
  });

  it("includes the centre cell's own key", () => {
    const keys = Spatial.neighborKeys([100, 100], 32);
    expect(keys).toContain(Spatial.cellKey([100, 100], 32));
  });

  it("covers exactly the eight surrounding cells and the centre", () => {
    const expected = new Set<number>();
    for (const dy of [-32, 0, 32]) {
      for (const dx of [-32, 0, 32]) {
        expected.add(Spatial.cellKey([100 + dx, 100 + dy], 32));
      }
    }
    expect(new Set(Spatial.neighborKeys([100, 100], 32))).toEqual(expected);
  });

  it("is symmetric: a neighbour's block contains the origin cell", () => {
    const origin = Spatial.cellKey([100, 100], 32);
    // The cell one to the right must list `origin` among its neighbours.
    expect(Spatial.neighborKeys([132, 100], 32)).toContain(origin);
  });
});
