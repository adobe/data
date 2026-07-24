// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Hazard } from "./hazard.js";
import { nextX } from "./next-x.js";

// Move the hazard by `velocity * dt`, wrapping its left edge around
// [0, boardWidth) so lanes scroll endlessly.
export const advance = (hazard: Hazard, dt: number, boardWidth: number): Hazard => ({
  ...hazard,
  x: nextX(hazard.x, hazard.velocity, dt, boardWidth),
});
