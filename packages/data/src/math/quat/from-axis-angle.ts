// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import type { Vec3 } from "../vec3/index.js";
import { identity } from "./identity.js";

export const fromAxisAngle = (axis: Vec3, angle: number): Quat => {
    const halfAngle = angle * 0.5;
    const s = Math.sin(halfAngle);
    const c = Math.cos(halfAngle);
    // Normalize the axis to ensure a unit quaternion
    const len = Math.sqrt(axis[0] * axis[0] + axis[1] * axis[1] + axis[2] * axis[2]);
    if (len === 0) return identity;
    const invLen = 1 / len;
    return [axis[0] * invLen * s, axis[1] * invLen * s, axis[2] * invLen * s, c];
};
