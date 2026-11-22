// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** The cell a selected face is a side of, in the root model's voxels: outside it for its walls. */
export const faceCell = Symbol();

declare module "@adobe/ecs" {
    interface Components {
        [faceCell]: { type: Vec3.I32 };
    }
}
