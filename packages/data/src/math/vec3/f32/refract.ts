// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";
import { dot } from "./dot.js";
import { scale } from "./scale.js";
import { subtract } from "./subtract.js";

export const refract = (i: F32, n: F32, eta: number): F32 => {
    const dotProduct = dot(n, i);
    const k = 1.0 - eta * eta * (1.0 - dotProduct * dotProduct);
    if (k < 0.0) {
        return [0, 0, 0];
    }
    const scaleFactor = eta * dotProduct + Math.sqrt(k);
    return subtract(scale(i, eta), scale(n, scaleFactor));
};
