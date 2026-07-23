// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Size } from "./size.js";

// Collision radius (pixels) per tier. Dense: every size always has one.
export const radius: Record<Size, number> = {
  large: 40,
  medium: 20,
  small: 10,
};
