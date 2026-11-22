// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity, Quat, Vec3 } from "@adobe/ecs";

/**
 * What moving a model's contents and sizing it again touches: the model, its voxels' scale, and what's in it, its
 * voxels, instances and selected faces, and the instances placing it, with their parent's voxels' scale.
 */
export type Reframing = {
    readonly model: Entity;
    readonly scale: Vec3;
    readonly voxels: readonly { readonly entity: Entity; readonly position: Vec3 }[];
    readonly placed: readonly { readonly entity: Entity; readonly position: Vec3 }[];
    readonly faces: readonly { readonly entity: Entity; readonly cell: Vec3.I32 }[];
    readonly placements: readonly { readonly entity: Entity; readonly position: Vec3; readonly rotation: Quat; readonly parentScale: Vec3 }[];
};
