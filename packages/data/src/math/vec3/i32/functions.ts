// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { I32 as Vec3_I32 } from "./i32.js";
import { I32 } from "../../i32/index.js";
import { U32 } from "../../u32/index.js";

export const zero: Vec3_I32 = [0, 0, 0];
export const one: Vec3_I32 = [1, 1, 1];

export const abs = ([x, y, z]: Vec3_I32): Vec3_I32 => [Math.abs(x), Math.abs(y), Math.abs(z)];

export const add = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    x1 + x2,
    y1 + y2,
    z1 + z2,
];
export const subtract = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    x1 - x2,
    y1 - y2,
    z1 - z2,
];
export const multiply = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    x1 * x2,
    y1 * y2,
    z1 * z2,
];
export const scale = ([x, y, z]: Vec3_I32, s: number): Vec3_I32 => [x * s, y * s, z * s];
export const negate = ([x, y, z]: Vec3_I32): Vec3_I32 => [-x, -y, -z];

export const min = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    Math.min(x1, x2),
    Math.min(y1, y2),
    Math.min(z1, z2),
];
export const max = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    Math.max(x1, x2),
    Math.max(y1, y2),
    Math.max(z1, z2),
];
export const clamp = (v: Vec3_I32, minVec: Vec3_I32, maxVec: Vec3_I32): Vec3_I32 => min(max(v, minVec), maxVec);

export const equals = (a: Vec3_I32, b: Vec3_I32): boolean => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const bitwiseAnd = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    x1 & x2,
    y1 & y2,
    z1 & z2,
];
export const bitwiseOr = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    x1 | x2,
    y1 | y2,
    z1 | z2,
];
export const bitwiseXor = ([x1, y1, z1]: Vec3_I32, [x2, y2, z2]: Vec3_I32): Vec3_I32 => [
    x1 ^ x2,
    y1 ^ y2,
    z1 ^ z2,
];
export const bitwiseNot = ([x, y, z]: Vec3_I32): Vec3_I32 => [~x, ~y, ~z];
export const shiftLeft = ([x, y, z]: Vec3_I32, s: number): Vec3_I32 => [x << s, y << s, z << s];
export const shiftRight = ([x, y, z]: Vec3_I32, s: number): Vec3_I32 => [
    I32.shiftRight(x, s),
    I32.shiftRight(y, s),
    I32.shiftRight(z, s),
];

export const countLeadingZeros = ([x, y, z]: Vec3_I32): Vec3_I32 => [
    U32.countLeadingZeros(x),
    U32.countLeadingZeros(y),
    U32.countLeadingZeros(z),
];
export const countTrailingZeros = ([x, y, z]: Vec3_I32): Vec3_I32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
    U32.countTrailingZeros(z),
];
export const countOneBits = ([x, y, z]: Vec3_I32): Vec3_I32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
    U32.countOneBits(z),
];
export const reverseBits = ([x, y, z]: Vec3_I32): Vec3_I32 => [
    U32.reverseBits(x),
    U32.reverseBits(y),
    U32.reverseBits(z),
];
