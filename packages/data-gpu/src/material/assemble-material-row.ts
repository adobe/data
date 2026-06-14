// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Material } from "./material.js";
import type { MaterialDefinition } from "./material-definition.js";
import { solidDefaults } from "./material-defaults.js";

/** Fields that `solidDefaults` does not supply — must appear on every definition or full row. */
const REQUIRED_KEYS = [
    "density",
    "restitution",
    "heatCapacity",
    "baseColorFactor",
    "emissiveFactor",
    "metallicFactor",
    "roughnessFactor",
] as const satisfies readonly (keyof Material)[];

/** Merge defaults + definition into a full `Material` row; throw if required fields are missing. */
export const assembleMaterialRow = (name: string, definition: MaterialDefinition): Material => {
    const row = { name, ...solidDefaults, ...definition };
    const missing = REQUIRED_KEYS.filter(key => row[key] === undefined);
    if (missing.length > 0) {
        throw new Error(`Material "${name}" is missing required fields: ${missing.join(", ")}`);
    }
    return row as Material;
};
