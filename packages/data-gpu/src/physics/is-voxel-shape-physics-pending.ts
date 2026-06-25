// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/** True while a body carries `voxelShapeName` but the mesh ref is not yet resolved. */
export const isVoxelShapePhysicsPending = (store: unknown, id: Entity): boolean => {
    const row = (store as { read(id: Entity): Record<string, unknown> | null }).read(id);
    return row?.voxelShapeName != null && row?.voxelShape == null;
};
