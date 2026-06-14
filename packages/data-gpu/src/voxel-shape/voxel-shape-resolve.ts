// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { Vec3 } from "@adobe/data/math";
import { VOXEL_BODY_HALF_EXTENTS } from "./voxel-mesh-scale.js";

export type VoxelShapeResolveContext = {
    get(id: Entity, component: "bodyType"): unknown;
    update(id: Entity, patch: { voxelShape: Entity; halfExtents?: Vec3 }): void;
};

/** True while a body carries `voxelShapeName` but the mesh ref is not yet resolved. */
export const isVoxelShapePhysicsPending = (store: unknown, id: Entity): boolean => {
    const row = (store as { read(id: Entity): Record<string, unknown> | null }).read(id);
    return row?.voxelShapeName != null && row?.voxelShape == null;
};

/** Attach mesh ref; dynamic bodies get the standard 0.5 unit-cube halfExtents. */
export const applyVoxelShapeResolve = (
    t: VoxelShapeResolveContext,
    args: { id: Entity; name: string; mesh: Entity },
): void => {
    if (t.get(args.id, "bodyType") != null) {
        t.update(args.id, {
            voxelShape: args.mesh,
            halfExtents: [...VOXEL_BODY_HALF_EXTENTS] as Vec3,
        });
        return;
    }
    t.update(args.id, { voxelShape: args.mesh });
};
