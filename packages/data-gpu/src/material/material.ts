// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3, Vec4 } from "@adobe/data/math";

/**
 * One row of the `Material` archetype — an authored material carrying both its
 * physical properties (read by any physics solver) and its visible PBR
 * properties (read by the renderer / material-array builder). Materials are an
 * open, data-driven registry, not a closed enum: add a row, never edit code.
 *
 * Texture maps are *sources* (URLs) fetched at runtime; `""` means "use the
 * neutral fallback layer". `metallicRoughnessUrl` and `occlusionUrl` may point
 * at the same ARM image (AO = R, Roughness = G, Metalness = B).
 */
export interface Material {
    name: string;
    // physical (read by any solver)
    density: number;
    restitution: number;
    friction: number;
    compliance: number;
    heatCapacity: number;
    // visible PBR factors (multipliers over the sampled maps)
    baseColorFactor: Vec4;
    emissiveFactor: Vec3;
    metallicFactor: number;
    roughnessFactor: number;
    normalScale: number;
    occlusionStrength: number;
    // texture sources, fetched at runtime ("" = neutral fallback layer)
    baseColorUrl: string;
    metallicRoughnessUrl: string;
    normalUrl: string;
    occlusionUrl: string;
    emissiveUrl: string;
}

export * as Material from "./public.js";
