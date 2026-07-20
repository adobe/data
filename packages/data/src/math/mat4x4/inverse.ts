// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";
import { determinant } from "./determinant.js";

export const inverse = (m: Mat4x4): Mat4x4 => {
    const det = determinant(m);
    if (det === 0) {
        throw new Error('Matrix is not invertible');
    }

    const [
        m00, m01, m02, m03,
        m10, m11, m12, m13,
        m20, m21, m22, m23,
        m30, m31, m32, m33
    ] = m;

    const b00 = m00 * m11 - m01 * m10;
    const b01 = m00 * m12 - m02 * m10;
    const b02 = m00 * m13 - m03 * m10;
    const b03 = m01 * m12 - m02 * m11;
    const b04 = m01 * m13 - m03 * m11;
    const b05 = m02 * m13 - m03 * m12;
    const b06 = m20 * m31 - m21 * m30;
    const b07 = m20 * m32 - m22 * m30;
    const b08 = m20 * m33 - m23 * m30;
    const b09 = m21 * m32 - m22 * m31;
    const b10 = m21 * m33 - m23 * m31;
    const b11 = m22 * m33 - m23 * m32;

    const invDet = 1.0 / det;
    return [
        (m11 * b11 - m12 * b10 + m13 * b09) * invDet,
        (m02 * b10 - m01 * b11 - m03 * b09) * invDet,
        (m31 * b05 - m32 * b04 + m33 * b03) * invDet,
        (m22 * b04 - m21 * b05 - m23 * b03) * invDet,
        (m12 * b08 - m10 * b11 - m13 * b07) * invDet,
        (m00 * b11 - m02 * b08 + m03 * b07) * invDet,
        (m32 * b02 - m30 * b05 - m33 * b01) * invDet,
        (m20 * b05 - m22 * b02 + m23 * b01) * invDet,
        (m10 * b10 - m11 * b08 + m13 * b06) * invDet,
        (m01 * b08 - m00 * b10 - m03 * b06) * invDet,
        (m30 * b04 - m31 * b02 + m33 * b00) * invDet,
        (m21 * b02 - m20 * b04 - m23 * b00) * invDet,
        (m11 * b07 - m10 * b09 - m12 * b06) * invDet,
        (m00 * b09 - m01 * b07 + m02 * b06) * invDet,
        (m31 * b01 - m30 * b03 - m32 * b00) * invDet,
        (m20 * b03 - m21 * b01 + m22 * b00) * invDet
    ];
};
