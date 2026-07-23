// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Size } from "./size.js";

// Points awarded for destroying an asteroid of each tier — smaller is riskier
// to hit, so it is worth more.
export const score: Record<Size, number> = {
  large: 20,
  medium: 50,
  small: 100,
};
