// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Size } from "./size.js";

// Stroke colour (canvas) per size tier, consumed by the ui/ asteroid renderer.
// A presentational descriptor: it lives with the type so the enum's per-member
// visuals are named here, not re-encoded at the draw site. Dense: every size
// always has one.
export const color: Record<Size, string> = {
  large: "#8a8aa0",
  medium: "#a9a9c0",
  small: "#cfcfe0",
};
