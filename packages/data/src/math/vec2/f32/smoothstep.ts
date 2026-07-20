// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const smoothstep = ([e0x, e0y]: F32, [e1x, e1y]: F32, [x, y]: F32): F32 => {
    const tx = Math.max(0, Math.min(1, (x - e0x) / (e1x - e0x)));
    const ty = Math.max(0, Math.min(1, (y - e0y) / (e1y - e0y)));
    return [tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)];
};
