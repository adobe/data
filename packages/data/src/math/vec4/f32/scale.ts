// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const scale = ([x, y, z, w]: F32, s: number): F32 => [x * s, y * s, z * s, w * s];
