// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const mod = ([x, y]: F32, m: number): F32 => [
    ((x % m) + m) % m,
    ((y % m) + m) % m
];
