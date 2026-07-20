// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";

export const perspective = (fovy: number, aspect: number, near: number, far: number): Mat4x4 => {
    if (fovy <= 0) throw new Error('Field of view must be greater than 0');
    if (aspect <= 0) throw new Error('Aspect ratio must be greater than 0');
    if (near <= 0) throw new Error('Near plane must be greater than 0');
    if (far <= near) throw new Error('Far plane must be greater than near plane');

    const f = 1.0 / Math.tan(fovy / 2);
    // WebGPU clip-space convention: z_ndc ∈ [0, 1].
    //   m[2][2] = far / (near - far)   maps z_view = -far → z_ndc = 1
    //   m[2][3] = (near*far) / (near-far) and m[3][2] = -1 maps z_view = -near → z_ndc = 0
    const fn = far / (near - far);
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, fn, -1,
        0, 0, near * fn, 0
    ];
};
