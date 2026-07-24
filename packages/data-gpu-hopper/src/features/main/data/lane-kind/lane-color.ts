// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { LaneKind } from "./lane-kind.js";
import type { Color } from "../color/color.js";

// Tile colour per terrain. Consumed by ui/ when baking the row cube materials.
export const laneColor: Record<LaneKind, Color> = {
  grass: [0.1, 0.4, 0.1, 1],
  road: [0.2, 0.2, 0.2, 1],
  river: [0.1, 0.3, 0.8, 1],
  goal: [1.0, 0.84, 0.0, 1],
};
