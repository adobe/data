// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import { conjugate } from "./conjugate.js";
import { lengthSquared } from "./length-squared.js";
import { scale } from "./scale.js";

export const inverse = (q: Quat): Quat => {
    const lenSq = lengthSquared(q);
    if (lenSq === 0) return [0, 0, 0, 1];
    return scale(conjugate(q), 1 / lenSq);
};
