// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Vec2 } from "@adobe/data/math";
import { Asteroid } from "./asteroid.js";
import { Size } from "../size/size.js";

const smallest = Size.values.find((s) => Size.smaller[s] === undefined) ?? Size.largest;

describe("Asteroid.split", () => {
  it("splits a splittable asteroid into splitCount children of the next-smaller tier", () => {
    const parent: Asteroid = { position: [7, 9], velocity: [10, 0], size: Size.largest };
    const children = Asteroid.split(parent);
    expect(children).toHaveLength(Size.splitCount[Size.largest]);
    for (const child of children) {
      expect(child.size).toBe(Size.smaller[Size.largest]);
      expect(child.position).toEqual(parent.position);
    }
  });

  it("scatters children faster than the parent", () => {
    const parent: Asteroid = { position: [0, 0], velocity: [10, 0], size: Size.largest };
    for (const child of Asteroid.split(parent)) {
      expect(Vec2.length(child.velocity)).toBeGreaterThan(Vec2.length(parent.velocity));
    }
  });

  it("destroys the smallest tier outright — no children", () => {
    const parent: Asteroid = { position: [0, 0], velocity: [10, 0], size: smallest };
    expect(Asteroid.split(parent)).toEqual([]);
  });
});
