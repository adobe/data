// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";

export const lookAt = (forward: Vec3, up: Vec3): Quat => {
    // Normalize forward vector
    const f = Vec3Namespace.normalize(forward);

    // Calculate right vector
    const r = Vec3Namespace.normalize(Vec3Namespace.cross(f, up));

    // Recalculate up vector
    const u = Vec3Namespace.cross(r, f);

    // Convert to quaternion
    const trace = r[0] + u[1] + f[2];

    if (trace > 0) {
        const s = Math.sqrt(trace + 1) * 2;
        return [
            (u[2] - f[1]) / s,
            (f[0] - r[2]) / s,
            (r[1] - u[0]) / s,
            0.25 * s
        ];
    } else if (r[0] > u[1] && r[0] > f[2]) {
        const s = Math.sqrt(1 + r[0] - u[1] - f[2]) * 2;
        return [
            0.25 * s,
            (u[0] + r[1]) / s,
            (f[0] + r[2]) / s,
            (u[2] - f[1]) / s
        ];
    } else if (u[1] > f[2]) {
        const s = Math.sqrt(1 + u[1] - r[0] - f[2]) * 2;
        return [
            (u[0] + r[1]) / s,
            0.25 * s,
            (f[1] + u[2]) / s,
            (f[0] - r[2]) / s
        ];
    } else {
        const s = Math.sqrt(1 + f[2] - r[0] - u[1]) * 2;
        return [
            (f[0] + r[2]) / s,
            (f[1] + u[2]) / s,
            0.25 * s,
            (r[1] - u[0]) / s
        ];
    }
};
