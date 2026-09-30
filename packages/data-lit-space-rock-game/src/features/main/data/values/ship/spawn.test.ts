// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Ship } from "./ship.js";

describe("Ship.spawn", () => {
  it("places a motionless ship at the given position", () => {
    const ship = Ship.spawn([50, 60]);
    expect(ship.position).toEqual([50, 60]);
    expect(ship.velocity).toEqual([0, 0]);
  });

  it("faces up (screen y grows downward)", () => {
    const ship = Ship.spawn([0, 0]);
    const [, fy] = Ship.facing(ship.rotation);
    expect(fy).toBeCloseTo(-1);
  });
});
