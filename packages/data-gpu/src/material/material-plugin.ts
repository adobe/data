// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database, Entity } from "@adobe/data/ecs";
import { F32, Vec3, Vec4 } from "@adobe/data/math";
import { standardMaterials } from "./standard-materials.js";

/**
 * The material registry — authored materials as ECS entities (an open set;
 * added rarely, edited never). Each `Material` row carries physical props (read
 * by any solver) and visible PBR factors + texture-source URLs (read by the
 * renderer). A body / model references a material by `Entity` id; the
 * render-side `materialGpu` plugin derives GPU textures + a palette from these
 * rows and caches them, rebuilding only when a new material appears.
 *
 * `seedStandardMaterials` inserts the standard library and records a
 * `name → Entity` lookup in the `materials` resource.
 */
export const plugin = Database.Plugin.create({
    components: {
        /** Reference (on a body, prop, or model) to a Material registry entity. */
        material:             Entity.schema,
        name:                 { type: "string" },
        density:              F32.schema,
        restitution:          F32.schema,
        friction:             F32.schema,
        compliance:           F32.schema,
        heatCapacity:         F32.schema,
        baseColorFactor:      Vec4.schema,
        emissiveFactor:       Vec3.schema,
        metallicFactor:       F32.schema,
        roughnessFactor:      F32.schema,
        normalScale:          F32.schema,
        occlusionStrength:    F32.schema,
        baseColorUrl:         { type: "string" },
        metallicRoughnessUrl: { type: "string" },
        normalUrl:            { type: "string" },
        occlusionUrl:         { type: "string" },
        emissiveUrl:          { type: "string" },
    },
    resources: {
        /** name → Material entity, populated by `seedStandardMaterials`. */
        materials: { default: {} as Record<string, Entity> },
    },
    archetypes: {
        Material: [
            "name",
            "density", "restitution", "friction", "compliance", "heatCapacity",
            "baseColorFactor", "emissiveFactor", "metallicFactor", "roughnessFactor", "normalScale", "occlusionStrength",
            "baseColorUrl", "metallicRoughnessUrl", "normalUrl", "occlusionUrl", "emissiveUrl",
        ],
    },
    transactions: {
        seedStandardMaterials(t) {
            const map: Record<string, Entity> = {};
            for (const m of standardMaterials) {
                map[m.name] = t.archetypes.Material.insert(m);
            }
            t.resources.materials = map;
        },
    },
});
