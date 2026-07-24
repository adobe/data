// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Size } from "../size/size.js";

// Grid-cell edge length for the `byCell` broad phase (see `cellKey` /
// `neighborKeys`). Must be ≥ the largest entity diameter so a 3×3 neighbour
// search captures every possible overlap; the biggest entities are asteroids,
// so it is derived from the size descriptors rather than named as a magic
// number. A pure data/ constant: both the ecs `byCell` computed-key index and
// the collision system's broad phase read the same value.
export const cellSize: number =
  2 * Math.max(...Size.values.map((size) => Size.radius[size]));
