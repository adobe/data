// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";

// The player ship: where it is, how fast it drifts, and which way it points
// (`rotation` in radians; velocity persists as momentum between ticks).
export type Ship = {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly rotation: number;
};
export * as Ship from "./public.js";
