// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";

// Positive-remainder modulo so negatives wrap forward (JS `%` keeps sign).
const mod = (a: number, b: number): number => ((a % b) + b) % b;

// Toroidal screen wrap: fold `position` back into the [0, bounds) rectangle,
// so an entity leaving one edge re-enters at the opposite one.
export const wrap = (position: Vec2, bounds: Vec2): Vec2 => [
  mod(position[0], bounds[0]),
  mod(position[1], bounds[1]),
];
