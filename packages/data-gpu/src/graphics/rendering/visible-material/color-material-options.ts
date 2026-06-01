// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";

export interface ColorMaterialOptions {
    color: readonly [number, number, number, number];
    emissive?: Vec3;
    metallic?: number;
    roughness?: number;
}
