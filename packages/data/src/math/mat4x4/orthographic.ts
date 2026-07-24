// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";

export const orthographic = (
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number
): Mat4x4 => {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    return [
        -2 * lr, 0, 0, 0,
        0, -2 * bt, 0, 0,
        0, 0, 2 * nf, 0,
        (left + right) * lr, (bottom + top) * bt, (far + near) * nf, 1
    ];
};
