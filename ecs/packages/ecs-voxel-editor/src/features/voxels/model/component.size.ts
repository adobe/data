// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** A model's extent, in voxels. */
export const size = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [size]: { type: Vec3 };
    }
}
