// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Size } from "./size.js";

// The tier a hit asteroid splits into. Sparse (Partial): the smallest tier
// has no smaller size, so its key is absent — the signal that it cannot split.
export const smaller: Partial<Record<Size, Size>> = {
  large: "medium",
  medium: "small",
};
