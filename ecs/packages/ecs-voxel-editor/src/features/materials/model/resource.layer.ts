// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Layer } from "./type.layer.js";

/** The mode editing is in: building with materials, or painting voxels. */
export const layer = Symbol();

declare module "@adobe/ecs" {
    interface Resources {
        [layer]: { type: Layer; default: "material" };
    }
}
