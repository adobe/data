// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// PBR texture maps © Poly Haven, CC0 (https://polyhaven.com). Fetched at
// runtime by URL — never committed (see data-gpu-samples/CLAUDE.md). Poly
// Haven's `arm` map packs AO(R) / Roughness(G) / Metalness(B), matching glTF's
// occlusion + metallicRoughness channel conventions.

import type { Material } from "./material.js";

const tex = (slug: string, map: string): string =>
    `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${slug}/${slug}_${map}_1k.jpg`;

/**
 * A standard material: physical constants (the old material table) plus neutral
 * visible factors — the textures supply colour / roughness / metalness, so the
 * factors are left at 1 and baseColor white.
 */
function standard(
    name: string, slug: string,
    density: number, restitution: number, friction: number, compliance: number, heatCapacity: number,
): Material {
    return {
        name,
        density, restitution, friction, compliance, heatCapacity,
        baseColorFactor: [1, 1, 1, 1],
        emissiveFactor: [0, 0, 0],
        metallicFactor: 1, roughnessFactor: 1, normalScale: 1, occlusionStrength: 1,
        baseColorUrl: tex(slug, "diff"),
        metallicRoughnessUrl: tex(slug, "arm"),
        normalUrl: tex(slug, "nor_gl"),
        occlusionUrl: tex(slug, "arm"),
        emissiveUrl: "",
    };
}

/** The standard material library, seeded by `seedStandardMaterials`. */
export const standardMaterials: readonly Material[] = [
    standard("rubber", "rubber_tiles",         1.1,  0.80, 0.90, 1e-5, 2.0),
    standard("wood",   "wood_table_001",       0.6,  0.35, 0.70, 5e-7, 1.7),
    standard("stone",  "cobblestone_floor_08", 2.6,  0.20, 0.85, 1e-8, 0.8),
    standard("steel",  "metal_plate",          7.8,  0.45, 0.50, 1e-9, 0.5),
    standard("ice",    "snow_02",              0.92, 0.25, 0.05, 5e-9, 2.1),
];
