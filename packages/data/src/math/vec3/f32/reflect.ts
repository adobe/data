// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";
import { dot } from "./dot.js";
import { scale } from "./scale.js";
import { subtract } from "./subtract.js";

export const reflect = (i: F32, n: F32): F32 => {
    const dot2 = dot(n, i) * 2;
    return subtract(i, scale(n, dot2));
};
