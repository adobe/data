// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Ship } from "./ship.js";

describe("Ship.muzzle", () => {
  it("spawns ahead of the nose and inherits ship momentum plus muzzle speed", () => {
    const ship: Ship = { position: [10, 10], velocity: [1, 2], rotation: 0 };
    const { position, velocity } = Ship.muzzle(ship, 100);
    expect(position).toEqual([10 + Ship.radius, 10]);
    expect(velocity).toEqual([1 + 100, 2]);
  });
});
