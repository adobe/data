// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { Wave } from "./wave.js";
import type { Asteroid } from "../asteroid/asteroid.js";
import { Size } from "../size/size.js";
import { Motion } from "../motion/motion.js";
import { asteroidCount } from "./asteroid-count.js";

// The asteroids of `wave`: a ring of large rocks around the centre of `bounds`
// (radius 0.4 · the shorter side, clear of the ship's spawn), each drifting
// tangentially. `speedOf` is called once per rock, in ring order, for its speed.
export const ring = (bounds: Vec2, wave: Wave, speedOf: () => number): Asteroid[] => {
  const count = asteroidCount(wave);
  const center = Vec2.scale(bounds, 0.5);
  const radius = Math.min(bounds[0], bounds[1]) * 0.4;
  const asteroids: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count;
    const outward = Motion.rotate([1, 0], angle);
    const tangent = Motion.rotate([1, 0], angle + Math.PI / 2);
    asteroids.push({
      position: Vec2.add(center, Vec2.scale(outward, radius)),
      velocity: Vec2.scale(tangent, speedOf()),
      size: Size.largest,
    });
  }
  return asteroids;
};
