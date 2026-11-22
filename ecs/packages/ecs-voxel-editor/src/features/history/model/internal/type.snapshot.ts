// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/**
 * What undo restores, across every model of the document whose main model is `main`: each model's size; each voxel, its cell, material, paint,
 * painted faces and model; each instance, the model it places, the model it's in and its place and rotation; and each selected face, its
 * model, cell and side. `contentKey` and `faceKey` tell one snapshot's voxels and instances, and faces, from another's.
 */
export type Snapshot = {
    readonly main: Entity;
    readonly sizes: readonly { readonly model: Entity; readonly size: readonly [number, number, number] }[];
    readonly voxels: readonly { readonly cell: readonly [number, number, number]; readonly material: Entity; readonly paint: Entity; readonly painted: number; readonly parent: Entity }[];
    readonly instances: readonly { readonly of: Entity; readonly parent: Entity; readonly position: readonly [number, number, number]; readonly rotation: readonly [number, number, number, number] }[];
    readonly faces: readonly { readonly parent: Entity; readonly cell: readonly [number, number, number]; readonly side: number }[];
    readonly contentKey: string;
    readonly faceKey: string;
};
