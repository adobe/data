// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Asteroid } from "./asteroid.js";
import { Size } from "../size/size.js";

describe("Asteroid.score", () => {
  it("reads the award from the size tier", () => {
    const asteroid: Asteroid = { position: [0, 0], velocity: [0, 0], size: Size.largest };
    expect(Asteroid.score(asteroid)).toBe(Size.score[Size.largest]);
  });
});
