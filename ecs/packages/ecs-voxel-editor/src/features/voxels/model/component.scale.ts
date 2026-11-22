// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** The world size of one of a model's voxels, wherever the model is placed. */
export const scale = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [scale]: { type: Vec3 };
    }
}
