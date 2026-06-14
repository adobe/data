// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/** Store or transaction surface that exposes the voxel shape name index. */
export interface VoxelShapeByNameLookup {
    resources: {
        _voxelShapeByName: Map<string, Entity> | null;
    };
}

/** Returns the baked-or-pending mesh entity for `name`, or throws if never seeded. */
export const requireVoxelShape = (db: VoxelShapeByNameLookup, name: string): Entity => {
    const mesh = db.resources._voxelShapeByName?.get(name) ?? null;
    if (mesh == null) {
        throw new Error(
            `Voxel shape "${name}" is not in the registry — call seedVoxelShapeDefinitions first.`,
        );
    }
    return mesh;
};
