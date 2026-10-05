// © 2026 Adobe. MIT License. See /LICENSE for details.

// Whether `point` lies within the half-open span [spanX, spanX + spanWidth) — the
// coverage rule for a hazard over a lane column.
export const coversAt = (spanX: number, spanWidth: number, point: number): boolean =>
  point >= spanX && point < spanX + spanWidth;
