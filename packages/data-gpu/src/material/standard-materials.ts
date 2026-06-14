// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Material } from "./material.js";
import { solidDefaults } from "./material-defaults.js";

/** Factor-only sample materials (no map URLs — rendered via `pbrFactorRender`). */
function factor(
    name: string,
    baseColorFactor: [number, number, number, number],
    metallicFactor: number,
    roughnessFactor: number,
    density: number, restitution: number, friction: number, compliance: number, heatCapacity: number,
): Material {
    return {
        name,
        ...solidDefaults,
        density, restitution, friction, compliance, heatCapacity,
        baseColorFactor,
        emissiveFactor: [0, 0, 0],
        metallicFactor,
        roughnessFactor,
        baseColorUrl: "",
        metallicRoughnessUrl: "",
        normalUrl: "",
        occlusionUrl: "",
        emissiveUrl: "",
    };
}

/** Small factor library seeded by `seedStandardMaterials`. */
export const standardMaterialNames = ["rubber", "wood", "stone", "steel", "ice"] as const;

export const standardMaterials: readonly Material[] = [
    factor("rubber", [0.15, 0.15, 0.15, 1], 0.0, 0.90, 1.1,  0.80, 0.90, 1e-5, 2.0),
    factor("wood",   [0.55, 0.35, 0.20, 1], 0.0, 0.75, 0.6,  0.35, 0.70, 5e-7, 1.7),
    factor("stone",  [0.45, 0.43, 0.40, 1], 0.05, 0.85, 2.6,  0.20, 0.85, 1e-8, 0.8),
    factor("steel",  [0.70, 0.72, 0.75, 1], 0.9, 0.35, 7.8,  0.45, 0.50, 1e-9, 0.5),
    factor("ice",    [0.85, 0.92, 0.95, 1], 0.0, 0.15, 0.92, 0.25, 0.05, 5e-9, 2.1),
];
