// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/** Store surface that exposes the voxel shape name index. */
export interface VoxelShapeByNameLookup {
    resources: {
        _voxelShapeByName: Map<string, Entity> | null;
    };
}

/** Returns the baked-or-pending mesh entity for `name`, or throws if not loaded. */
export const requireVoxelShape = (db: VoxelShapeByNameLookup, name: string): Entity => {
    const mesh = db.resources._voxelShapeByName?.get(name) ?? null;
    if (mesh == null) {
        throw new Error(
            `Voxel shape "${name}" is not in the registry — load ${name}.json first.`,
        );
    }
    return mesh;
};
