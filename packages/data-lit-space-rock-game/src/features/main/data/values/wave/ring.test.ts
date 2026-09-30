// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Wave } from "./wave.js";

describe("Wave.ring", () => {
  it("places asteroidCount(wave) large rocks on a ring, drifting tangentially", () => {
    const speeds = [10, 20, 30, 40];
    const rocks = Wave.ring([200, 200], 1, () => speeds.shift() ?? 0);
    expect(rocks.map((r) => r.size)).toEqual(["large", "large", "large", "large"]);
    const rounded = rocks.map((r) => [...r.position, ...r.velocity].map((v) => Math.round(v) + 0));
    expect(rounded).toEqual([
      [180, 100, 0, 10],
      [100, 180, -20, 0],
      [20, 100, 0, -30],
      [100, 20, 40, 0],
    ]);
  });

  it("grows by one rock per wave", () => {
    expect(Wave.ring([200, 200], 2, () => Wave.speed)).toHaveLength(Wave.asteroidCount(2));
  });
});
