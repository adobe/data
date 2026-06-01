// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "@adobe/data/math";

/**
 * Lighting state — one directional light plus optional image-based lighting
 * from an HDR environment map. Setting `environmentUrl` triggers the IBL
 * bake; it's the only field consumed for setup rather than as direct shader
 * input.
 */
export interface Light {
    direction: Vec3;
    color: Vec3;
    ambientStrength: number;
    environmentUrl: string | null;
}

export * as Light from "./public.js";
