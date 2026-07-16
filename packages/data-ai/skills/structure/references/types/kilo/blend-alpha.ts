import { clampAlphaUnit } from "./clamp-alpha-unit.js";

export const blendAlpha = (a: number, b: number, weight: number): number =>
  clampAlphaUnit(a * (1 - weight) + b * weight);
