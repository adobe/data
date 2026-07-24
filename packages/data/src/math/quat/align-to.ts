// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import type { Vec3 } from "../vec3/index.js";
import { Vec3 as Vec3Namespace } from "../vec3/index.js";
import { fromAxisAngle } from "./from-axis-angle.js";
import { identity } from "./identity.js";
import { multiply } from "./multiply.js";

/**
 * Returns a quaternion that aligns the local Z-axis to the given direction via the shortest arc,
 * then applies an additional twist around that aligned Z-axis.
 *
 * Note: This aligns the Z axis.
 *
 * @param direction - Target world-space direction for local Z. If zero-length, returns identity.
 * @param twistRadians - Extra rotation around the aligned Z-axis, in radians. Defaults to 0.
 */
export const alignTo = (direction: Vec3, twistRadians: number = 0): Quat => {
    const zAxis: Vec3 = [0, 0, 1];
    const dirLen = Vec3Namespace.length(direction);
    if (dirLen === 0) return identity;

    const dir = Vec3Namespace.normalize(direction);
    const dotVal = Vec3Namespace.dot(zAxis, dir);

    let base: Quat;
    if (dotVal > 0.999999) {
        base = identity;
    } else if (dotVal < -0.999999) {
        // Opposite: 180° around any axis orthogonal to Z
        const orthoCandidate: Vec3 = [1, 0, 0];
        const axis = Math.abs(Vec3Namespace.dot(zAxis, orthoCandidate)) > 0.999 ? [0, 1, 0] as Vec3 : orthoCandidate;
        base = fromAxisAngle(axis, Math.PI);
    } else {
        const axis = Vec3Namespace.normalize(Vec3Namespace.cross(zAxis, dir));
        const angle = Math.acos(dotVal);
        base = fromAxisAngle(axis, angle);
    }

    if (twistRadians === 0) return base;

    // Twist around the final aligned Z (which is 'dir' in world space)
    const twist = fromAxisAngle(dir, twistRadians);
    return multiply(twist, base);
};
