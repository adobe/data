// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Marks a material as a paint: one coating a voxel, picked in paint mode, rather than one it's made of. */
export const isPaint = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [isPaint]: { type: true };
    }
}
