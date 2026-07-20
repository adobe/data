// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";
import { zero } from "./zero.js";

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
