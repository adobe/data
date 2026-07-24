// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Hazard } from "./hazard.js";
import { coversAt } from "./covers-at.js";

// Whether the continuous column `x` lies within this hazard's span [x, x+width).
export const covers = (hazard: Hazard, x: number): boolean =>
  coversAt(hazard.x, hazard.width, x);
