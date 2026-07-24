// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const random = (): F32 => {
    return [Math.random(), Math.random(), Math.random()];
};
