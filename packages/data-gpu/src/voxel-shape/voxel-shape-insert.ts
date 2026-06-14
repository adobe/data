// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";
import type { DenseVolume } from "@adobe/data/volume";
import type { Vec3 } from "@adobe/data/math";
import { volumeContentKey } from "./volume-content-key.js";

type VoxelMeshResources = {
    _voxelMeshByKey: Map<string, Entity> | null;
    _voxelVolumeByMesh?: Map<Entity, DenseVolume<boolean>> | null;
};

export type InsertVoxelShapeMeshContext = {
    resources: VoxelMeshResources;
    archetypes: {
        VoxelMeshPending: {
            insert: (row: { voxelVolumeSize: Vec3 }) => Entity;
        };
    };
};

export const insertVoxelShapeMesh = (
    t: InsertVoxelShapeMeshContext,
    args: { volume: DenseVolume<boolean> },
): Entity => {
    const key = volumeContentKey(args.volume);
    const byKey = t.resources._voxelMeshByKey ??= new Map();
    const existing = byKey.get(key);
    if (existing != null) return existing;

    const id = t.archetypes.VoxelMeshPending.insert({
        voxelVolumeSize: [...args.volume.size] as Vec3,
    });
    (t.resources._voxelVolumeByMesh ??= new Map()).set(id, args.volume);
    byKey.set(key, id);
    return id;
};
