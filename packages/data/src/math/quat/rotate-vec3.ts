// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";

export const rotateVec3 = ([x, y, z, w]: Quat, v: Vec3): Vec3 => {
    // q * v * q^-1
    const qv: Vec3 = [x, y, z];
    const uv = Vec3Namespace.cross(qv, v);
    const uuv = Vec3Namespace.cross(qv, uv);
    const scaleFactor = 2 * w;
    return [
        v[0] + scaleFactor * uv[0] + 2 * uuv[0],
        v[1] + scaleFactor * uv[1] + 2 * uuv[1],
        v[2] + scaleFactor * uv[2] + 2 * uuv[2]
    ];
};
