// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Quat } from "../index.js";

export const add = ([x1, y1, z1, w1]: Quat, [x2, y2, z2, w2]: Quat): Quat => [
    x1 + x2,
    y1 + y2,
    z1 + z2,
    w1 + w2
];
