// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Mat4x4, Vec3 } from "@adobe/ecs";

/**
 * What a frame draws: each model's voxels once per place it appears, a range of the drawn voxels' order with the matrix
 * taking them to the world; the model being edited, its size and matrix, which its walls, axes and selected faces are
 * drawn through; and its selected faces' range of the faces' order.
 */
export type DrawList = {
    readonly draws: readonly { readonly start: number; readonly count: number; readonly toWorld: Mat4x4 }[];
    readonly edit: { readonly size: Vec3; readonly toWorld: Mat4x4 };
    readonly faces: { readonly start: number; readonly count: number };
};
