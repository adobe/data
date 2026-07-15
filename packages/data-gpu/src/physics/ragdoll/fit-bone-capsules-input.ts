// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { SkinVertices } from "./skin-vertices.js";

export interface FitBoneCapsulesInput {
    jointCount: number;
    /** glTF inverse-bind matrices, column-major, `jointCount × 16`. */
    inverseBindMatrices: Float32Array;
    skin: SkinVertices;
    /** A vertex joins a bone only if its dominant weight ≥ this (default 0.5). */
    minWeight?: number;
    /** Bones with fewer assigned vertices than this get no capsule (default 6). */
    minVertices?: number;
}
