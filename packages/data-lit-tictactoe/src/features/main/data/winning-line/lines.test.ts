// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { lines } from "./lines.js";

describe("lines", () => {
  it("is the eight winning triples of board indices", () => {
    expect(lines).toEqual([
      [0, 1, 2],
      [3, 4, 5],
      [6, 7, 8],
      [0, 3, 6],
      [1, 4, 7],
      [2, 5, 8],
      [0, 4, 8],
      [2, 4, 6],
    ]);
  });

  it("references only valid cell indices, three per line", () => {
    for (const line of lines) {
      expect(line).toHaveLength(3);
      for (const i of line) expect(i).toBeGreaterThanOrEqual(0);
      for (const i of line) expect(i).toBeLessThanOrEqual(8);
    }
  });
});
