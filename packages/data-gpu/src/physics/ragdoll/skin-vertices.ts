// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Skinned vertices in mesh (bind) space. */
export interface SkinVertices {
    positions: Float32Array;
    joints: Uint32Array;
    weights: Float32Array;
}
