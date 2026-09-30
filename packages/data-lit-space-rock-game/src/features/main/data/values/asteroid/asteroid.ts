// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";
import type { Size } from "../size/size.js";

// A drifting asteroid: position, constant velocity, and its size tier (which
// determines radius, score, and how it splits).
export type Asteroid = {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly size: Size;
};
export * as Asteroid from "./public.js";
