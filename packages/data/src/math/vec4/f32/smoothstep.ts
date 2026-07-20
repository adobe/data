// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const smoothstep = ([e0x, e0y, e0z, e0w]: F32, [e1x, e1y, e1z, e1w]: F32, [x, y, z, w]: F32): F32 => {
    const tx = Math.max(0, Math.min(1, (x - e0x) / (e1x - e0x)));
    const ty = Math.max(0, Math.min(1, (y - e0y) / (e1y - e0y)));
    const tz = Math.max(0, Math.min(1, (z - e0z) / (e1z - e0z)));
    const tw = Math.max(0, Math.min(1, (w - e0w) / (e1w - e0w)));
    return [
        tx * tx * (3 - 2 * tx),
        ty * ty * (3 - 2 * ty),
        tz * tz * (3 - 2 * tz),
        tw * tw * (3 - 2 * tw)
    ];
};
