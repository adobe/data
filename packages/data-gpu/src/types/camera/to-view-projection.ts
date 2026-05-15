// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Mat4x4, Vec3 } from "@adobe/data/math";
import type { Camera } from "./camera.js";

export const toViewProjection = (cam: Camera): Mat4x4 => {
    const lookAt = Mat4x4.lookAt(cam.position, cam.target, cam.up);

    const f = 1.0 / Math.tan(cam.fieldOfView / 2);
    const d = Vec3.distance(cam.position, cam.target);

    // WebGPU clip-space convention: z_ndc ∈ [0, 1].
    // Perspective wants m[2][2] = far/(near-far); orthographic wants d/(near-far)
    // so that z_clip(z_view = -far) = (perspective: far / w_clip=far → 1)
    //                                  (orthographic: d / w_clip=d → 1).
    // Blend the two cases by the orthographic factor.
    const m22 = ((1 - cam.orthographic) * cam.farPlane + cam.orthographic * d) / (cam.nearPlane - cam.farPlane);
    const m23 = cam.nearPlane * m22;

    // Fourth row blends: w' = (1 - orthographic) * (-z) + orthographic * d
    const perspective: Mat4x4 = [
        f / cam.aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, m22, -(1 - cam.orthographic),
        0, 0, m23, cam.orthographic * d,
    ];

    return Mat4x4.multiply(perspective, lookAt);
};
