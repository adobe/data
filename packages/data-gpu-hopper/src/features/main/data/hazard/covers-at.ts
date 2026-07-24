// © 2026 Adobe. MIT License. See /LICENSE for details.

// Whether `point` lies within the half-open span [hazardX, hazardX + width). The
// primitive shared by `covers` (the data spec) and the ecs movement system's
// carrier scan (which reads columns directly), so the coverage rule is defined
// once.
export const coversAt = (hazardX: number, hazardWidth: number, point: number): boolean =>
  point >= hazardX && point < hazardX + hazardWidth;
