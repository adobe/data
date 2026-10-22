import type { F32 } from "./f32.js";

export const mod = ([x, y, z, w]: F32, m: number): F32 => [
    x - m * Math.floor(x / m),
    y - m * Math.floor(y / m),
    z - m * Math.floor(z / m),
    w - m * Math.floor(w / m),
];
