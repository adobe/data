// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { U32 } from "@adobe/ecs";

/**
 * Which of a voxel's faces its `paint` covers, a bit for each side, `1 << side`: +x, -x, +y, -y, +z, -z. The others
 * show its material; with none set, its paint is its material.
 */
export const paintedFaces = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [paintedFaces]: { type: U32 };
    }
}
