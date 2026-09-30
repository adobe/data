// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Frog } from "./frog.js";
import { Direction } from "../direction/direction.js";

const clamp = (value: number, max: number): number => Math.max(0, Math.min(max, value));

// The frog one cell in `direction`: a log-ridden fractional `x` snaps back onto the
// grid, and the result is clamped to a `width` x `height` board.
export const hop = (frog: Frog, direction: Direction, width: number, height: number): Frog => {
  const { dx, dy } = Direction.delta[direction];
  return {
    x: clamp(Math.round(frog.x) + dx, width - 1),
    y: clamp(frog.y + dy, height - 1),
  };
};
