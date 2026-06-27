// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/** Store or transaction surface that exposes the material name index. */
export interface MaterialByNameLookup {
    indexes: {
        materialByName: { get(args: { name: string }): Entity | null };
    };
}

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
