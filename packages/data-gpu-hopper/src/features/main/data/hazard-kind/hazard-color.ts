// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { HazardKind } from "./hazard-kind.js";
import type { Color } from "../color/color.js";

// Cube colour per hazard. Consumed by ui/ when baking hazard materials.
export const hazardColor: Record<HazardKind, Color> = {
  car: [0.9, 0.3, 0.1, 1],
  log: [0.5, 0.3, 0.1, 1],
};
