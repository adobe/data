// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Direction } from "./direction.js";

// Grid displacement per hop. `up` moves toward the goal (increasing row); `x`
// grows to the right. The hop transform reads this instead of re-deriving it.
export const delta: Record<Direction, { readonly dx: number; readonly dy: number }> = {
  up: { dx: 0, dy: 1 },
  down: { dx: 0, dy: -1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};
