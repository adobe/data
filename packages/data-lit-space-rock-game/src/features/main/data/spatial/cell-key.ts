// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";

// Discrete grid-cell id for a world position. `@adobe/data` indexes hash on a
// component's *value*, so a continuous `position` can't be indexed directly —
// we index on this derived cell id instead. Integer cell coords
// (floor(pos / cellSize)) are packed into one U32: low 16 bits x, high 16 bits
// y. Same cell → same key; distinct cells → distinct keys while |coord| <
// 32768 (millions of pixels at any sane cellSize). `cellSize` must be ≥ the
// largest entity diameter so a 3×3 neighbour search (see `neighborKeys`)
// captures every possible overlap.
export const cellKey = (position: Vec2, cellSize: number): number => {
  const cx = Math.floor(position[0] / cellSize) & 0xffff;
  const cy = Math.floor(position[1] / cellSize) & 0xffff;
  return ((cy << 16) | cx) >>> 0;
};
