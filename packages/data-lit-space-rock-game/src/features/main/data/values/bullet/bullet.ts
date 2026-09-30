// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec2 } from "@adobe/data/math";

// A fired bullet: position, constant-speed velocity, and how many seconds it has
// been alive (`age`, used to expire it).
export type Bullet = {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly age: number;
};
export * as Bullet from "./public.js";
