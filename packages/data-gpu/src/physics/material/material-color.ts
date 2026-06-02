// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";
import type { Material } from "./material.js";

/**
 * Per-material base albedo for debug rendering. Lets a viewer read a body's
 * material at a glance (wood tan, steel metallic-blue, ice pale cyan, …).
 * A renderer may brighten this while a body moves, but must retain the hue.
 */
export const materialColor: Record<Material, Vec3> = {
    rubber: [0.13, 0.13, 0.14],
    wood:   [0.62, 0.42, 0.20],
    stone:  [0.52, 0.52, 0.55],
    steel:  [0.62, 0.66, 0.74],
    ice:    [0.60, 0.82, 0.92],
};
