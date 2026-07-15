// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 } from "./f32.js";

// Constants
export const zero: F32 = [0, 0];

// Mathematical Operations
export const abs = ([x, y]: F32): F32 => [Math.abs(x), Math.abs(y)];
export const ceil = ([x, y]: F32): F32 => [Math.ceil(x), Math.ceil(y)];
export const floor = ([x, y]: F32): F32 => [Math.floor(x), Math.floor(y)];
export const round = ([x, y]: F32): F32 => [Math.round(x), Math.round(y)];
export const trunc = ([x, y]: F32): F32 => [Math.trunc(x), Math.trunc(y)];
export const min = ([x1, y1]: F32, [x2, y2]: F32): F32 => [Math.min(x1, x2), Math.min(y1, y2)];
export const max = ([x1, y1]: F32, [x2, y2]: F32): F32 => [Math.max(x1, x2), Math.max(y1, y2)];
export const clamp = (v: F32, minVec: F32, maxVec: F32): F32 => min(max(v, minVec), maxVec);
export const mix = ([x1, y1]: F32, [x2, y2]: F32, t: number): F32 => [
    x1 * (1 - t) + x2 * t,
    y1 * (1 - t) + y2 * t
];
export const step = ([edge1, edge2]: F32, [x, y]: F32): F32 => [
    x < edge1 ? 0 : 1,
    y < edge2 ? 0 : 1
];
export const smoothstep = ([e0x, e0y]: F32, [e1x, e1y]: F32, [x, y]: F32): F32 => {
    const tx = Math.max(0, Math.min(1, (x - e0x) / (e1x - e0x)));
    const ty = Math.max(0, Math.min(1, (y - e0y) / (e1y - e0y)));
    return [tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)];
};

export const equals = ([x1, y1]: F32, [x2, y2]: F32): boolean => x1 === x2 && y1 === y2;

// Geometric Functions
export const length = ([x, y]: F32): number => Math.sqrt(x * x + y * y);
export const distance = (a: F32, b: F32): number => length(subtract(b, a));
export const dot = ([x1, y1]: F32, [x2, y2]: F32): number => x1 * x2 + y1 * y2;
export const normalize = (v: F32): F32 => {
    const len = length(v);
    return len === 0 ? [0, 0] : scale(v, 1 / len);
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
        return [0, 0];
    }
    const scaleFactor = eta * dotProduct + Math.sqrt(k);
    return subtract(scale(i, eta), scale(n, scaleFactor));
};

// Trigonometric Functions
export const sin = ([x, y]: F32): F32 => [Math.sin(x), Math.sin(y)];
export const cos = ([x, y]: F32): F32 => [Math.cos(x), Math.cos(y)];
export const tan = ([x, y]: F32): F32 => [Math.tan(x), Math.tan(y)];
export const asin = ([x, y]: F32): F32 => [Math.asin(x), Math.asin(y)];
export const acos = ([x, y]: F32): F32 => [Math.acos(x), Math.acos(y)];
export const atan = ([x, y]: F32): F32 => [Math.atan(x), Math.atan(y)];
export const sinh = ([x, y]: F32): F32 => [Math.sinh(x), Math.sinh(y)];
export const cosh = ([x, y]: F32): F32 => [Math.cosh(x), Math.cosh(y)];
export const tanh = ([x, y]: F32): F32 => [Math.tanh(x), Math.tanh(y)];
export const asinh = ([x, y]: F32): F32 => [Math.asinh(x), Math.asinh(y)];
export const acosh = ([x, y]: F32): F32 => [Math.acosh(x), Math.acosh(y)];
export const atanh = ([x, y]: F32): F32 => [Math.atanh(x), Math.atanh(y)];

// Common Functions
export const sign = ([x, y]: F32): F32 => [Math.sign(x), Math.sign(y)];
export const fract = ([x, y]: F32): F32 => [x - Math.floor(x), y - Math.floor(y)];
export const mod = ([x, y]: F32, m: number): F32 => [
    ((x % m) + m) % m,
    ((y % m) + m) % m
];
export const modf = ([x, y]: F32): { fract: F32; whole: F32 } => ({
    whole: [Math.trunc(x), Math.trunc(y)],
    fract: [x - Math.trunc(x), y - Math.trunc(y)]
});
export const pow = ([x1, y1]: F32, [x2, y2]: F32): F32 => [
    Math.pow(x1, x2),
    Math.pow(y1, y2)
];
export const exp = ([x, y]: F32): F32 => [Math.exp(x), Math.exp(y)];
export const exp2 = ([x, y]: F32): F32 => [Math.pow(2, x), Math.pow(2, y)];
export const log = ([x, y]: F32): F32 => [Math.log(x), Math.log(y)];
export const log2 = ([x, y]: F32): F32 => [Math.log2(x), Math.log2(y)];
export const sqrt = ([x, y]: F32): F32 => [Math.sqrt(x), Math.sqrt(y)];

// Helper functions needed by some of the above
export const add = ([x1, y1]: F32, [x2, y2]: F32): F32 => [x1 + x2, y1 + y2];
export const subtract = ([x1, y1]: F32, [x2, y2]: F32): F32 => [x1 - x2, y1 - y2];
export const scale = ([x, y]: F32, s: number): F32 => [x * s, y * s];
export const negate = ([x, y]: F32): F32 => [-x, -y];
