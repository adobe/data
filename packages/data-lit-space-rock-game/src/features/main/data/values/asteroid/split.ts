// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { Asteroid } from "./asteroid.js";
import { Size } from "../size/size.js";
import { Motion } from "../motion/motion.js";

// Children fan out symmetrically around the parent's heading...
const spread = 0.4;
// ...and speed up, so debris scatters faster than the rock it came from.
const speedup = 1.4;

// Break an asteroid hit by a bullet into its children. The smallest tier has
// no smaller size, so it yields none — it is simply destroyed.
export const split = (asteroid: Asteroid): readonly Asteroid[] => {
  const childSize = Size.smaller[asteroid.size];
  if (childSize === undefined) {
    return [];
  }
  const count = Size.splitCount[asteroid.size];
  const children: Asteroid[] = [];
  for (let i = 0; i < count; i++) {
    const angle = spread * (i - (count - 1) / 2);
    children.push({
      position: asteroid.position,
      velocity: Vec2.scale(Motion.rotate(asteroid.velocity, angle), speedup),
      size: childSize,
    });
  }
  return children;
};
