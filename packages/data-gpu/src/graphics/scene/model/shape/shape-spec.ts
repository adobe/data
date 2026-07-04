// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Authored procedural mesh intent — consumed by the shape baker, not the renderer. */
export type ShapeSpec =
    | { kind: "unitSphere" }
    | { kind: "unitBox" }
    | { kind: "capsule"; radius: number; halfHeight: number }
    | { kind: "convexHull"; points: Float32Array }
    | { kind: "triMesh"; positions: Float32Array; indices: Uint32Array };
