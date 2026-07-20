// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";

export const rotationY = (angle: number): Mat4x4 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        c, 0, s, 0,
        0, 1, 0, 0,
        -s, 0, c, 0,
        0, 0, 0, 1
    ];
};
