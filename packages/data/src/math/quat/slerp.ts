// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";
import { add } from "./add.js";
import { dot } from "./dot.js";
import { negate } from "./negate.js";
import { normalize } from "./normalize.js";
import { scale } from "./scale.js";

export const slerp = (q1: Quat, q2: Quat, t: number): Quat => {
    const dotProduct = dot(q1, q2);

    // If the dot product is negative, slerp won't take the shorter route
    const q2Adjusted = dotProduct < 0 ? negate(q2) : q2;
    const adjustedDot = Math.abs(dotProduct);

    // If the inputs are too close for comfort, linearly interpolate
    if (adjustedDot > 0.9995) {
        return normalize(add(scale(q1, 1 - t), scale(q2Adjusted, t)));
    }

    const theta = Math.acos(adjustedDot);
    const sinTheta = Math.sin(theta);
    const factor1 = Math.sin((1 - t) * theta) / sinTheta;
    const factor2 = Math.sin(t * theta) / sinTheta;

    return normalize(add(scale(q1, factor1), scale(q2Adjusted, factor2)));
};
