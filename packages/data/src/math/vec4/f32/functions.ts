// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

// Mathematical Operations
export const abs = ([x, y, z, w]: F32): F32 => [Math.abs(x), Math.abs(y), Math.abs(z), Math.abs(w)];
export const ceil = ([x, y, z, w]: F32): F32 => [Math.ceil(x), Math.ceil(y), Math.ceil(z), Math.ceil(w)];
export const floor = ([x, y, z, w]: F32): F32 => [Math.floor(x), Math.floor(y), Math.floor(z), Math.floor(w)];
export const round = ([x, y, z, w]: F32): F32 => [Math.round(x), Math.round(y), Math.round(z), Math.round(w)];
export const trunc = ([x, y, z, w]: F32): F32 => [Math.trunc(x), Math.trunc(y), Math.trunc(z), Math.trunc(w)];
export const min = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.min(z1, z2),
    Math.min(w1, w2)
];
export const max = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    Math.max(x1, x2),
    Math.max(y1, y2),
    Math.max(z1, z2),
    Math.max(w1, w2)
];
export const clamp = (v: F32, minVec: F32, maxVec: F32): F32 => min(max(v, minVec), maxVec);
export const mix = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32, t: number): F32 => [
    x1 * (1 - t) + x2 * t,
    y1 * (1 - t) + y2 * t,
    z1 * (1 - t) + z2 * t,
    w1 * (1 - t) + w2 * t
];
export const step = ([edge1, edge2, edge3, edge4]: F32, [x, y, z, w]: F32): F32 => [
    x < edge1 ? 0 : 1,
    y < edge2 ? 0 : 1,
    z < edge3 ? 0 : 1,
    w < edge4 ? 0 : 1
];
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

// Geometric Functions
export const length = ([x, y, z, w]: F32): number => Math.sqrt(x * x + y * y + z * z + w * w);
export const distance = (a: F32, b: F32): number => length(subtract(b, a));
export const dot = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): number =>
    x1 * x2 + y1 * y2 + z1 * z2 + w1 * w2;
export const normalize = (v: F32): F32 => {
    const len = length(v);
    return len === 0 ? [0, 0, 0, 0] : scale(v, 1 / len);
};
export const faceforward = (n: F32, i: F32, nref: F32): F32 =>
    dot(nref, i) < 0 ? n : negate(n);
export const reflect = (i: F32, n: F32): F32 => {
    const dot2 = dot(n, i) * 2;
    return subtract(i, scale(n, dot2));
};
export const refract = (i: F32, n: F32, eta: number): F32 => {
    const dotProduct = dot(n, i);
    const k = 1.0 - eta * eta * (1.0 - dotProduct * dotProduct);
    if (k < 0.0) {
        return [0, 0, 0, 0];
    }
    const scaleFactor = eta * dotProduct + Math.sqrt(k);
    return subtract(scale(i, eta), scale(n, scaleFactor));
};

// Trigonometric Functions
export const sin = ([x, y, z, w]: F32): F32 => [Math.sin(x), Math.sin(y), Math.sin(z), Math.sin(w)];
export const cos = ([x, y, z, w]: F32): F32 => [Math.cos(x), Math.cos(y), Math.cos(z), Math.cos(w)];
export const tan = ([x, y, z, w]: F32): F32 => [Math.tan(x), Math.tan(y), Math.tan(z), Math.tan(w)];
export const asin = ([x, y, z, w]: F32): F32 => [Math.asin(x), Math.asin(y), Math.asin(z), Math.asin(w)];
export const acos = ([x, y, z, w]: F32): F32 => [Math.acos(x), Math.acos(y), Math.acos(z), Math.acos(w)];
export const atan = ([x, y, z, w]: F32): F32 => [Math.atan(x), Math.atan(y), Math.atan(z), Math.atan(w)];
export const sinh = ([x, y, z, w]: F32): F32 => [Math.sinh(x), Math.sinh(y), Math.sinh(z), Math.sinh(w)];
export const cosh = ([x, y, z, w]: F32): F32 => [Math.cosh(x), Math.cosh(y), Math.cosh(z), Math.cosh(w)];
export const tanh = ([x, y, z, w]: F32): F32 => [Math.tanh(x), Math.tanh(y), Math.tanh(z), Math.tanh(w)];
export const asinh = ([x, y, z, w]: F32): F32 => [Math.asinh(x), Math.asinh(y), Math.asinh(z), Math.asinh(w)];
export const acosh = ([x, y, z, w]: F32): F32 => [Math.acosh(x), Math.acosh(y), Math.acosh(z), Math.acosh(w)];
export const atanh = ([x, y, z, w]: F32): F32 => [Math.atanh(x), Math.atanh(y), Math.atanh(z), Math.atanh(w)];

// Common Functions
export const sign = ([x, y, z, w]: F32): F32 => [Math.sign(x), Math.sign(y), Math.sign(z), Math.sign(w)];
export const fract = ([x, y, z, w]: F32): F32 => [
    x - Math.floor(x),
    y - Math.floor(y),
    z - Math.floor(z),
    w - Math.floor(w)
];
export const mod = ([x, y, z, w]: F32, m: number): F32 => [
    ((x % m) + m) % m,
    ((y % m) + m) % m,
    ((z % m) + m) % m,
    ((w % m) + m) % m
];
export const modf = ([x, y, z, w]: F32): { fract: F32; whole: F32 } => ({
    whole: [Math.trunc(x), Math.trunc(y), Math.trunc(z), Math.trunc(w)],
    fract: [x - Math.trunc(x), y - Math.trunc(y), z - Math.trunc(z), w - Math.trunc(w)]
});
export const pow = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    Math.pow(x1, x2),
    Math.pow(y1, y2),
    Math.pow(z1, z2),
    Math.pow(w1, w2)
];
export const exp = ([x, y, z, w]: F32): F32 => [Math.exp(x), Math.exp(y), Math.exp(z), Math.exp(w)];
export const exp2 = ([x, y, z, w]: F32): F32 => [Math.pow(2, x), Math.pow(2, y), Math.pow(2, z), Math.pow(2, w)];
export const log = ([x, y, z, w]: F32): F32 => [Math.log(x), Math.log(y), Math.log(z), Math.log(w)];
export const log2 = ([x, y, z, w]: F32): F32 => [Math.log2(x), Math.log2(y), Math.log2(z), Math.log2(w)];
export const sqrt = ([x, y, z, w]: F32): F32 => [Math.sqrt(x), Math.sqrt(y), Math.sqrt(z), Math.sqrt(w)];

// Helper functions needed by some of the above
export const add = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    x1 + x2,
    y1 + y2,
    z1 + z2,
    w1 + w2
];
export const subtract = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    x1 - x2,
    y1 - y2,
    z1 - z2,
    w1 - w2
];
export const multiply = ([x1, y1, z1, w1]: F32, [x2, y2, z2, w2]: F32): F32 => [
    x1 * x2,
    y1 * y2,
    z1 * z2,
    w1 * w2
];
export const scale = ([x, y, z, w]: F32, s: number): F32 => [x * s, y * s, z * s, w * s];
export const negate = ([x, y, z, w]: F32): F32 => [-x, -y, -z, -w];
