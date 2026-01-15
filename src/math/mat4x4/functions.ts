// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import type { Vec4 } from "../vec4/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";

export type Index = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;

// Basic Matrix Operations
export const identity: Mat4x4 = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
];

export const zero: Mat4x4 = [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
];

// Matrix-Matrix Operations
export const add = (a: Mat4x4, b: Mat4x4): Mat4x4 => [
    a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3],
    a[4] + b[4], a[5] + b[5], a[6] + b[6], a[7] + b[7],
    a[8] + b[8], a[9] + b[9], a[10] + b[10], a[11] + b[11],
    a[12] + b[12], a[13] + b[13], a[14] + b[14], a[15] + b[15]
];

export const subtract = (a: Mat4x4, b: Mat4x4): Mat4x4 => [
    a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3],
    a[4] - b[4], a[5] - b[5], a[6] - b[6], a[7] - b[7],
    a[8] - b[8], a[9] - b[9], a[10] - b[10], a[11] - b[11],
    a[12] - b[12], a[13] - b[13], a[14] - b[14], a[15] - b[15]
];

export const multiply = (a: Mat4x4, b: Mat4x4): Mat4x4 => {
    const result: number[] = new Array(16);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let sum = 0;
            for (let k = 0; k < 4; k++) {
                sum += a[k * 4 + i as Index] * b[j * 4 + k as Index];
            }
            result[j * 4 + i] = sum;
        }
    }
    return result as unknown as Mat4x4;
};

// Matrix-Scalar Operations
export const scale = (m: Mat4x4, s: number): Mat4x4 => [
    m[0] * s, m[1] * s, m[2] * s, m[3] * s,
    m[4] * s, m[5] * s, m[6] * s, m[7] * s,
    m[8] * s, m[9] * s, m[10] * s, m[11] * s,
    m[12] * s, m[13] * s, m[14] * s, m[15] * s
];

// Matrix-Vector Operations
export const multiplyVec4 = (m: Mat4x4, v: Vec4): Vec4 => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
];

export const multiplyVec3 = (m: Mat4x4, v: Vec3): Vec3 => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]
];

// Matrix Properties
export const determinant = (m: Mat4x4): number => {
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

    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};

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

export const transpose = (m: Mat4x4): Mat4x4 => [
    m[0], m[4], m[8], m[12],
    m[1], m[5], m[9], m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15]
];

// Transformation Matrices
export const translation = (x: number, y: number, z: number): Mat4x4 => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1
];

export const scaling = (x: number, y: number, z: number): Mat4x4 => [
    x, 0, 0, 0,
    0, y, 0, 0,
    0, 0, z, 0,
    0, 0, 0, 1
];

export const rotationX = (angle: number): Mat4x4 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        1, 0, 0, 0,
        0, c, s, 0,
        0, -s, c, 0,
        0, 0, 0, 1
    ];
};

export const rotationY = (angle: number): Mat4x4 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        c, 0, s, 0,
        0, 1, 0, 0,
        -s, 0, c, 0,
        0, 0, 0, 1
    ];
};

export const rotationZ = (angle: number): Mat4x4 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        c, -s, 0, 0,
        s, c, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];
};

// Projection Matrices
export const perspective = (fovy: number, aspect: number, near: number, far: number): Mat4x4 => {
    if (fovy <= 0) throw new Error('Field of view must be greater than 0');
    if (aspect <= 0) throw new Error('Aspect ratio must be greater than 0');
    if (near <= 0) throw new Error('Near plane must be greater than 0');
    if (far <= near) throw new Error('Far plane must be greater than near plane');

    const f = 1.0 / Math.tan(fovy / 2);
    const nf = near / (near - far);
    return [
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, nf, -1,
        0, 0, near * nf, 0
    ];
};

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

// View Matrix
export const lookAt = (eye: Vec3, center: Vec3, up: Vec3): Mat4x4 => {
    // Validate inputs
    if (Vec3Namespace.length(up) === 0) throw new Error('Up vector cannot be zero');

    const forward = Vec3Namespace.subtract(center, eye);
    if (Vec3Namespace.length(forward) === 0) throw new Error('Eye and center cannot be the same position');

    const f = Vec3Namespace.normalize(forward);
    const s = Vec3Namespace.normalize(Vec3Namespace.cross(f, up));

    // Check if up vector is parallel to view direction
    if (Vec3Namespace.length(s) === 0) throw new Error('Up vector cannot be parallel to view direction');

    const u = Vec3Namespace.normalize(Vec3Namespace.cross(s, f));

    return [
        s[0], u[0], -f[0], 0,
        s[1], u[1], -f[1], 0,
        s[2], u[2], -f[2], 0,
        -Vec3Namespace.dot(s, eye), -Vec3Namespace.dot(u, eye), Vec3Namespace.dot(f, eye), 1
    ];
};
