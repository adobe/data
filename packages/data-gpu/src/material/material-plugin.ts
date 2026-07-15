import { Database, Entity } from "@adobe/data/ecs";
import { F32, U32, Vec3, Vec4 } from "@adobe/data/math";
import { definitions } from "./definitions.js";
import type { Material } from "./material.js";
import type { MaterialDefinition } from "./material-definition.js";
import type { MaterialName } from "./material-name.js";
import { solidDefaults } from "./material-defaults.js";
import { assembleMaterialRow } from "./assemble-material-row.js";
import { standardMaterials } from "./standard-materials.js";
import { StressStrainCurve } from "./stress-strain-curve/stress-strain-curve.js";

/**
 * Material registry — each material type is one `Material` entity with every
 * property as its own ECS component. Bodies reference a material by entity id.
 * Lookup by name via `indexes.materialByName`.
 */
export const plugin = Database.Plugin.create({
    components: {
        /** Reference on a body, prop, or voxel to a Material registry entity. */
        material: Entity.schema,
        name: { type: "string" },
        // rigid-body physics
        density: F32.schema,
        restitution: F32.schema,
        friction: F32.schema,
        compliance: F32.schema,
        heatCapacity: F32.schema,
        // simulation
        viscosity: F32.schema,
        thermalConductivity: F32.schema,
        stressStrainCurve: StressStrainCurve.schema,
        // visible PBR
        baseColorFactor: Vec4.schema,
        emissiveFactor: Vec3.schema,
        metallicFactor: F32.schema,
        roughnessFactor: F32.schema,
        normalScale: F32.schema,
        occlusionStrength: F32.schema,
        irReflectance: F32.schema,
        irEmission: F32.schema,
        emissionMode: U32.schema,
        // texture sources
        baseColorUrl: { type: "string" },
        metallicRoughnessUrl: { type: "string" },
        normalUrl: { type: "string" },
        occlusionUrl: { type: "string" },
        emissiveUrl: { type: "string" },
    },
    archetypes: {
        Material: [
            "name",
            "density", "restitution", "friction", "compliance", "heatCapacity",
            "viscosity", "thermalConductivity", "stressStrainCurve",
            "baseColorFactor", "emissiveFactor", "metallicFactor", "roughnessFactor",
            "normalScale", "occlusionStrength", "irReflectance", "irEmission", "emissionMode",
            "baseColorUrl", "metallicRoughnessUrl", "normalUrl", "occlusionUrl", "emissiveUrl",
        ],
    },
    indexes: {
        materialByName: { key: "name", unique: true, archetype: "Material" },
    },
    transactions: {
        insertMaterial(t, row: Material): Entity {
            const { name, ...definition } = row;
            return t.archetypes.Material.insert(assembleMaterialRow(name, definition));
        },
        insertMaterialDefinition(t, args: { name: string; definition: MaterialDefinition }): Entity {
            return t.archetypes.Material.insert(assembleMaterialRow(args.name, args.definition));
        },
        insertMaterialDefinitions(t, defs: Readonly<Record<string, MaterialDefinition>>): void {
            for (const [name, definition] of Object.entries(defs)) {
                t.archetypes.Material.insert(assembleMaterialRow(name, definition));
            }
        },
        /** Textured PBR library used by graphics samples (rubber, wood, stone, steel, ice). */
        seedStandardMaterials(t) {
            for (const row of standardMaterials) {
                const { name, ...definition } = row;
                t.archetypes.Material.insert(assembleMaterialRow(name, definition));
            }
        },
        /** Solid material library from `definitions` (authored catalog). */
        seedDefinitionMaterials(t) {
            for (const name of Object.keys(definitions) as MaterialName[]) {
                t.archetypes.Material.insert(assembleMaterialRow(name, definitions[name]));
            }
        },
    },
});
