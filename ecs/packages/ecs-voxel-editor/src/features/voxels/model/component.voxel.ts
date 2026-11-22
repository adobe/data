// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Marks an entity as a voxel. */
export const voxel = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [voxel]: { type: true };
    }
}
