// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

export const mod = ([x, y, z, w]: F32, m: number): F32 => [
    ((x % m) + m) % m,
    ((y % m) + m) % m,
    ((z % m) + m) % m,
    ((w % m) + m) % m
];
