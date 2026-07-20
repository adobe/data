// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import type { Mat4x4 } from "../mat4x4/index.js";

/**
 * Converts a quaternion to a 4x4 rotation matrix in column-major order.
 * The resulting matrix is compatible with WebGPU and can be directly used
 * with Mat4x4 operations.
 */
export const toMat4 = ([x, y, z, w]: Quat): Mat4x4 => {
    const xx = x * x;
    const yy = y * y;
    const zz = z * z;
    const xy = x * y;
    const xz = x * z;
    const yz = y * z;
    const wx = w * x;
    const wy = w * y;
    const wz = w * z;

    // Column-major format (WebGPU standard)
    return [
        1 - 2 * (yy + zz), 2 * (xy + wz), 2 * (xz - wy), 0,
        2 * (xy - wz), 1 - 2 * (xx + zz), 2 * (yz + wx), 0,
        2 * (xz + wy), 2 * (yz - wx), 1 - 2 * (xx + yy), 0,
        0, 0, 0, 1
    ];
};
