// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";
import { length } from "./length.js";
import { scale } from "./scale.js";

export const normalize = (v: F32): F32 => {
    const len = length(v);
    return len === 0 ? [0, 0, 0, 0] : scale(v, 1 / len);
};
