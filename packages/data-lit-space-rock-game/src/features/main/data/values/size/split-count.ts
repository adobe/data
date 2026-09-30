// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Size } from "./size.js";

// How many children a hit asteroid of each tier splits into. The smallest
// tier splits into nothing — it is simply destroyed.
export const splitCount: Record<Size, number> = {
  large: 2,
  medium: 2,
  small: 0,
};
