// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";
import type { Ship } from "./ship.js";

// A fresh ship at `position`, motionless, pointing "up". Screen y grows
// downward, so up is -π/2.
export const spawn = (position: Vec2): Ship => ({
  position,
  velocity: Vec2.zero,
  rotation: -Math.PI / 2,
});
