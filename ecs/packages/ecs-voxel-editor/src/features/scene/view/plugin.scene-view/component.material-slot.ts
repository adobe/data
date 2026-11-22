// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";

/**
 * A voxel's material as the GPU finds it: its slot in the material table. Shaders can't read an entity, which is 64 bits,
 * so this view keeps it beside the voxel's `material`.
 */
export const materialSlot = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [materialSlot]: { type: U32 };
    }
}
