// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Mat4x4, Vec3, Vec4, Line3 } from "@adobe/data/math";
import type { Camera } from "./camera.js";
import { toViewProjection } from "./to-view-projection.js";

export const screenToWorldRay = (
    cam: Camera,
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
    rayLength = 1000,
): Line3 => {
    const ndcX = (screenX / canvasWidth) * 2 - 1;
    const ndcY = 1 - (screenY / canvasHeight) * 2;

    // WebGPU NDC z ∈ [0, 1]: near plane at 0, far plane at 1.
    const nearPoint: Vec4 = [ndcX, ndcY, 0, 1];
    const farPoint: Vec4 = [ndcX, ndcY, 1, 1];

    const invVP = Mat4x4.inverse(toViewProjection(cam));

    const nearW = Mat4x4.multiplyVec4(invVP, nearPoint);
    const farW = Mat4x4.multiplyVec4(invVP, farPoint);

    const near: Vec3 = [nearW[0] / nearW[3], nearW[1] / nearW[3], nearW[2] / nearW[3]];
    const far: Vec3 = [farW[0] / farW[3], farW[1] / farW[3], farW[2] / farW[3]];

    const dir: Vec3 = [near[0] - far[0], near[1] - far[1], near[2] - far[2]];
    const len = Math.sqrt(dir[0] ** 2 + dir[1] ** 2 + dir[2] ** 2);

    if (len < 0.0001) return { a: near, b: far };

    const norm: Vec3 = [dir[0] / len, dir[1] / len, dir[2] / len];
    const end: Vec3 = [near[0] + norm[0] * rayLength, near[1] + norm[1] * rayLength, near[2] + norm[2] * rayLength];

    return { a: near, b: end };
};
