// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { MaterialByNameLookup } from "./material-by-name-lookup.js";

/** Returns the material entity for `name`, or throws if it was never seeded. */
export const requireMaterial = (db: MaterialByNameLookup, name: string): Entity => {
    const material = db.indexes.materialByName.get({ name });
    if (material == null) {
        throw new Error(
            `Material "${name}" is not in the registry — seed materials first (seedStandardMaterials or seedDefinitionMaterials).`,
        );
    }
    return material;
};
