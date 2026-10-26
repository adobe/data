// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { F32 } from "./f32.js";

export const mod = ([x, y, z]: F32, m: number): F32 => [
    x - m * Math.floor(x / m),
    y - m * Math.floor(y / m),
    z - m * Math.floor(z / m),
];
