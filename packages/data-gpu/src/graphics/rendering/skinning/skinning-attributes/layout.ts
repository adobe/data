// © 2026 Adobe. MIT License. See /LICENSE for details.

// Skinning attributes live in a separate vertex buffer from the StandardVertex
// data so static meshes pay no per-vertex cost. Encoded as:
//
//   joints  (uint32 × 4) — joint indices into the skeleton (16 bytes)
//   weights (float32 × 4) — skinning weights, sum to 1.0   (16 bytes)
//
// Total stride: 32 bytes / vertex.

export const SKINNING_STRIDE = 32;

export const layout: GPUVertexBufferLayout = {
    arrayStride: SKINNING_STRIDE,
    stepMode: "vertex",
    attributes: [
        { format: "uint32x4",  offset: 0,  shaderLocation: 4 },
        { format: "float32x4", offset: 16, shaderLocation: 5 },
    ],
};
