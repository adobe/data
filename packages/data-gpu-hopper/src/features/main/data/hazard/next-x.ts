// © 2026 Adobe. MIT License. See /LICENSE for details.

// The wrapped left-edge position of a hazard after moving `velocity * dt`, kept
// within [0, boardWidth). The primitive shared by `advance` (the data spec) and
// the ecs movement system (which writes columns directly, with no per-row
// allocation) — so the two can't drift.
export const nextX = (x: number, velocity: number, dt: number, boardWidth: number): number => {
  const raw = x + velocity * dt;
  return ((raw % boardWidth) + boardWidth) % boardWidth;
};
