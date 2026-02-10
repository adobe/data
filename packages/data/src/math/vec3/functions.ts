// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Vec3 } from "./index.js";

export const zero: Vec3 = [0, 0, 0];
export const one: Vec3 = [1, 1, 1];

// Mathematical Operations
export const abs = ([x, y, z]: Vec3): Vec3 => [Math.abs(x), Math.abs(y), Math.abs(z)];
export const ceil = ([x, y, z]: Vec3): Vec3 => [Math.ceil(x), Math.ceil(y), Math.ceil(z)];
export const floor = ([x, y, z]: Vec3): Vec3 => [Math.floor(x), Math.floor(y), Math.floor(z)];
export const round = ([x, y, z]: Vec3): Vec3 => [Math.round(x), Math.round(y), Math.round(z)];
export const trunc = ([x, y, z]: Vec3): Vec3 => [Math.trunc(x), Math.trunc(y), Math.trunc(z)];
export const min = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3 => [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.min(z1, z2)
];
export const max = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3 => [
    Math.max(x1, x2),
    Math.max(y1, y2),
    Math.max(z1, z2)
];
export const clamp = (v: Vec3, minVec: Vec3, maxVec: Vec3): Vec3 => min(max(v, minVec), maxVec);
export const mix = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3, t: number): Vec3 => [
    x1 * (1 - t) + x2 * t,
    y1 * (1 - t) + y2 * t,
    z1 * (1 - t) + z2 * t
];
export const step = ([edge1, edge2, edge3]: Vec3, [x, y, z]: Vec3): Vec3 => [
    x < edge1 ? 0 : 1,
    y < edge2 ? 0 : 1,
    z < edge3 ? 0 : 1
];
export const smoothstep = ([e0x, e0y, e0z]: Vec3, [e1x, e1y, e1z]: Vec3, [x, y, z]: Vec3): Vec3 => {
    const tx = Math.max(0, Math.min(1, (x - e0x) / (e1x - e0x)));
    const ty = Math.max(0, Math.min(1, (y - e0y) / (e1y - e0y)));
    const tz = Math.max(0, Math.min(1, (z - e0z) / (e1z - e0z)));
    return [
        tx * tx * (3 - 2 * tx),
        ty * ty * (3 - 2 * ty),
        tz * tz * (3 - 2 * tz)
    ];
};
export const random = (): Vec3 => {
    return [Math.random(), Math.random(), Math.random()];
};

// Geometric Functions
export const lengthSquared = ([x, y, z]: Vec3): number => x * x + y * y + z * z;
export const length = ([x, y, z]: Vec3): number => Math.sqrt(x * x + y * y + z * z);
export const distance = (a: Vec3, b: Vec3): number => length(subtract(b, a));
export const distanceSquared = (a: Vec3, b: Vec3): number => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    return dx * dx + dy * dy + dz * dz;
};
export const dot = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): number =>
    x1 * x2 + y1 * y2 + z1 * z2;
export const cross = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3 => [
    y1 * z2 - z1 * y2,
    z1 * x2 - x1 * z2,
    x1 * y2 - y1 * x2
];
export const normalize = (v: Vec3): Vec3 => {
    const len = length(v);
    return len === 0 ? [0, 0, 0] : scale(v, 1 / len);
};
export const faceforward = (n: Vec3, i: Vec3, nref: Vec3): Vec3 =>
    dot(nref, i) < 0 ? n : negate(n);
export const reflect = (i: Vec3, n: Vec3): Vec3 => {
    const dot2 = dot(n, i) * 2;
    return subtract(i, scale(n, dot2));
};
export const refract = (i: Vec3, n: Vec3, eta: number): Vec3 => {
    const dotProduct = dot(n, i);
    const k = 1.0 - eta * eta * (1.0 - dotProduct * dotProduct);
    if (k < 0.0) {
        return [0, 0, 0];
    }
    const scaleFactor = eta * dotProduct + Math.sqrt(k);
    return subtract(scale(i, eta), scale(n, scaleFactor));
};

// Trigonometric Functions
export const sin = ([x, y, z]: Vec3): Vec3 => [Math.sin(x), Math.sin(y), Math.sin(z)];
export const cos = ([x, y, z]: Vec3): Vec3 => [Math.cos(x), Math.cos(y), Math.cos(z)];
export const tan = ([x, y, z]: Vec3): Vec3 => [Math.tan(x), Math.tan(y), Math.tan(z)];
export const asin = ([x, y, z]: Vec3): Vec3 => [Math.asin(x), Math.asin(y), Math.asin(z)];
export const acos = ([x, y, z]: Vec3): Vec3 => [Math.acos(x), Math.acos(y), Math.acos(z)];
export const atan = ([x, y, z]: Vec3): Vec3 => [Math.atan(x), Math.atan(y), Math.atan(z)];
export const sinh = ([x, y, z]: Vec3): Vec3 => [Math.sinh(x), Math.sinh(y), Math.sinh(z)];
export const cosh = ([x, y, z]: Vec3): Vec3 => [Math.cosh(x), Math.cosh(y), Math.cosh(z)];
export const tanh = ([x, y, z]: Vec3): Vec3 => [Math.tanh(x), Math.tanh(y), Math.tanh(z)];
export const asinh = ([x, y, z]: Vec3): Vec3 => [Math.asinh(x), Math.asinh(y), Math.asinh(z)];
export const acosh = ([x, y, z]: Vec3): Vec3 => [Math.acosh(x), Math.acosh(y), Math.acosh(z)];
export const atanh = ([x, y, z]: Vec3): Vec3 => [Math.atanh(x), Math.atanh(y), Math.atanh(z)];

// Common Functions
export const sign = ([x, y, z]: Vec3): Vec3 => [Math.sign(x), Math.sign(y), Math.sign(z)];
export const fract = ([x, y, z]: Vec3): Vec3 => [
    x - Math.floor(x),
    y - Math.floor(y),
    z - Math.floor(z)
];
export const mod = ([x, y, z]: Vec3, m: number): Vec3 => [
    ((x % m) + m) % m,
    ((y % m) + m) % m,
    ((z % m) + m) % m
];
export const modf = ([x, y, z]: Vec3): { fract: Vec3; whole: Vec3 } => ({
    whole: [Math.trunc(x), Math.trunc(y), Math.trunc(z)],
    fract: [x - Math.trunc(x), y - Math.trunc(y), z - Math.trunc(z)]
});
export const pow = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3 => [
    Math.pow(x1, x2),
    Math.pow(y1, y2),
    Math.pow(z1, z2)
];
export const exp = ([x, y, z]: Vec3): Vec3 => [Math.exp(x), Math.exp(y), Math.exp(z)];
export const exp2 = ([x, y, z]: Vec3): Vec3 => [Math.pow(2, x), Math.pow(2, y), Math.pow(2, z)];
export const log = ([x, y, z]: Vec3): Vec3 => [Math.log(x), Math.log(y), Math.log(z)];
export const log2 = ([x, y, z]: Vec3): Vec3 => [Math.log2(x), Math.log2(y), Math.log2(z)];
export const sqrt = ([x, y, z]: Vec3): Vec3 => [Math.sqrt(x), Math.sqrt(y), Math.sqrt(z)];

// Helper functions needed by some of the above
export const add = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3 => [
    x1 + x2,
    y1 + y2,
    z1 + z2
];
export const subtract = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3 => [
    x1 - x2,
    y1 - y2,
    z1 - z2
];
/**
 * Performs a component-wise multiplication of two vectors.
 */
export const multiply = ([x1, y1, z1]: Vec3, [x2, y2, z2]: Vec3): Vec3 => [
    x1 * x2,
    y1 * y2,
    z1 * z2
];
export const scale = ([x, y, z]: Vec3, s: number): Vec3 => [x * s, y * s, z * s];
export const negate = ([x, y, z]: Vec3): Vec3 => [-x, -y, -z];

export const equals = (a: Vec3, b: Vec3): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
