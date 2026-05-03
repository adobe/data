// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "../../vec3/index.js";
import { Aabb } from "../index.js";
import type { Face } from "./face.js";
import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

/**
 * Single-face bit closest to `position` in normalized box space (unit cube centered on origin by default).
 * @param position World position of the sample point
 * @param aabb Bounds used to compute the box center (defaults to unit cube)
 */
export const fromPosition = (position: Vec3, aabb: Aabb = Aabb.unit): Face => {
    const aabbCenter = Aabb.center(aabb);
    const localPos = [
        position[0] - aabbCenter[0],
        position[1] - aabbCenter[1],
        position[2] - aabbCenter[2],
    ];

    const absX = Math.abs(localPos[0]);
    const absY = Math.abs(localPos[1]);
    const absZ = Math.abs(localPos[2]);

    if (absX >= absY && absX >= absZ) {
        return localPos[0] > 0 ? POS_X : NEG_X;
    }
    if (absY >= absZ) {
        return localPos[1] > 0 ? POS_Y : NEG_Y;
    }
    return localPos[2] > 0 ? POS_Z : NEG_Z;
};
