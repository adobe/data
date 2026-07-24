// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";

// Move `position` by `velocity` over `dt` seconds (explicit Euler integration).
export const advance = (position: Vec2, velocity: Vec2, dt: number): Vec2 =>
  Vec2.add(position, Vec2.scale(velocity, dt));
