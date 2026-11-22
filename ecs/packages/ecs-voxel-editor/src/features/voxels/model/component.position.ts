// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** A voxel's cell within its model, or where an instance's origin sits within the model it's placed in, in that model's voxels. */
export const position = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [position]: { type: Vec3 };
    }
}
