// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import type { Vec3 } from "../vec3/index.js";

export const toAxisAngle = ([x, y, z, w]: Quat): { axis: Vec3; angle: number } => {
    const angle = 2 * Math.acos(Math.abs(w));
    const s = Math.sin(angle * 0.5);
    if (s === 0) {
        return { axis: [0, 0, 1], angle: 0 };
    }
    return {
        axis: [x / s, y / s, z / s],
        angle: w < 0 ? -angle : angle
    };
};
