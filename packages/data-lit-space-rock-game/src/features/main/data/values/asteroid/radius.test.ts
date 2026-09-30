// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Asteroid } from "./asteroid.js";
import { Size } from "../size/size.js";

describe("Asteroid.radius", () => {
  it("reads the collision radius from the size tier", () => {
    const asteroid: Asteroid = { position: [0, 0], velocity: [0, 0], size: Size.largest };
    expect(Asteroid.radius(asteroid)).toBe(Size.radius[Size.largest]);
  });
});
