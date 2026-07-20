// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Mat4x4 } from "./index.js";

export const rotationZ = (angle: number): Mat4x4 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
        c, -s, 0, 0,
        s, c, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
    ];
};
