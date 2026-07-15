// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec3_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const zero: Vec3_U32 = [0, 0, 0];
export const one: Vec3_U32 = [1, 1, 1];

export const add = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    (x1 + x2) >>> 0,
    (y1 + y2) >>> 0,
    (z1 + z2) >>> 0,
];
export const subtract = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    (x1 - x2) >>> 0,
    (y1 - y2) >>> 0,
    (z1 - z2) >>> 0,
];
export const multiply = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    (x1 * x2) >>> 0,
    (y1 * y2) >>> 0,
    (z1 * z2) >>> 0,
];
export const scale = ([x, y, z]: Vec3_U32, s: number): Vec3_U32 => [
    (x * s) >>> 0,
    (y * s) >>> 0,
    (z * s) >>> 0,
];
export const negate = ([x, y, z]: Vec3_U32): Vec3_U32 => [(-x) >>> 0, (-y) >>> 0, (-z) >>> 0];

export const min = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    Math.min(x1, x2) >>> 0,
    Math.min(y1, y2) >>> 0,
    Math.min(z1, z2) >>> 0,
];
export const max = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    Math.max(x1, x2) >>> 0,
    Math.max(y1, y2) >>> 0,
    Math.max(z1, z2) >>> 0,
];
export const clamp = (v: Vec3_U32, minVec: Vec3_U32, maxVec: Vec3_U32): Vec3_U32 => min(max(v, minVec), maxVec);

export const equals = (a: Vec3_U32, b: Vec3_U32): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const volume = ([x, y, z]: Vec3_U32): number => (x * y * z) >>> 0;

export const bitwiseAnd = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    (x1 & x2) >>> 0,
    (y1 & y2) >>> 0,
    (z1 & z2) >>> 0,
];
export const bitwiseOr = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    (x1 | x2) >>> 0,
    (y1 | y2) >>> 0,
    (z1 | z2) >>> 0,
];
export const bitwiseXor = ([x1, y1, z1]: Vec3_U32, [x2, y2, z2]: Vec3_U32): Vec3_U32 => [
    (x1 ^ x2) >>> 0,
    (y1 ^ y2) >>> 0,
    (z1 ^ z2) >>> 0,
];
export const bitwiseNot = ([x, y, z]: Vec3_U32): Vec3_U32 => [(~x) >>> 0, (~y) >>> 0, (~z) >>> 0];
export const shiftLeft = ([x, y, z]: Vec3_U32, s: number): Vec3_U32 => [
    (x << s) >>> 0,
    (y << s) >>> 0,
    (z << s) >>> 0,
];
export const shiftRight = ([x, y, z]: Vec3_U32, s: number): Vec3_U32 => [
    U32.shiftRight(x, s),
    U32.shiftRight(y, s),
    U32.shiftRight(z, s),
];

export const countLeadingZeros = ([x, y, z]: Vec3_U32): Vec3_U32 => [
    U32.countLeadingZeros(x),
    U32.countLeadingZeros(y),
    U32.countLeadingZeros(z),
];
export const countTrailingZeros = ([x, y, z]: Vec3_U32): Vec3_U32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
    U32.countTrailingZeros(z),
];
export const countOneBits = ([x, y, z]: Vec3_U32): Vec3_U32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
    U32.countOneBits(z),
];
export const reverseBits = ([x, y, z]: Vec3_U32): Vec3_U32 => [
    U32.reverseBits(x),
    U32.reverseBits(y),
    U32.reverseBits(z),
];
