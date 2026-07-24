// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Vec2 } from "@adobe/data/math";

// Two circles overlap when the distance between centres is within the sum of
// their radii. Every game collision (bullet↔asteroid, ship↔asteroid) is one.
export const circlesOverlap = (
  aPos: Vec2,
  aRadius: number,
  bPos: Vec2,
  bRadius: number,
): boolean => Vec2.distance(aPos, bPos) <= aRadius + bRadius;
