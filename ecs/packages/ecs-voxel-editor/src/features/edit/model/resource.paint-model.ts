// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Entity } from "@adobe/ecs";

/** The model extruding places instances of, in place of voxels of the selected material: none to fill voxels. */
export const paintModel = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [paintModel]: { type: Entity };
    }
}
