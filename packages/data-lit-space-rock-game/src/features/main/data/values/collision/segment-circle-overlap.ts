// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";

// Swept collision: does the segment [p0,p1] pass within `radius` of `center`?
// A fast bullet advances many pixels per frame, so sampling only its end
// position (point-vs-circle) lets it tunnel clean through a small asteroid.
// Testing the whole travelled segment closes that gap: find the closest point
// on [p0,p1] to `center` (the projection clamped to the segment ends) and
// compare its distance to `radius`. A degenerate segment (p0==p1) reduces to
// the point-vs-circle test.
export const segmentCircleOverlap = (
  p0: Vec2,
  p1: Vec2,
  center: Vec2,
  radius: number,
): boolean => {
  const seg = Vec2.subtract(p1, p0);
  const lenSq = Vec2.dot(seg, seg);
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, Vec2.dot(Vec2.subtract(center, p0), seg) / lenSq));
  const closest = Vec2.add(p0, Vec2.scale(seg, t));
  return Vec2.distance(closest, center) <= radius;
};
