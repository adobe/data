// © 2026 Adobe. MIT License. See /LICENSE for details.

// A hazard's left edge after scrolling `velocity * dt` along its lane, wrapped into
// [0, boardWidth). Takes plain numbers so the ecs step can apply it to columns
// without per-row allocation.
export const nextX = (x: number, velocity: number, dt: number, boardWidth: number): number => {
  const raw = x + velocity * dt;
  return ((raw % boardWidth) + boardWidth) % boardWidth;
};
