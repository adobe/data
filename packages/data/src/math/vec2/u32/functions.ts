// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { U32 as Vec2_U32 } from "./u32.js";
import { U32 } from "../../u32/index.js";

export const zero: Vec2_U32 = [0, 0];

export const add = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    (x1 + x2) >>> 0,
    (y1 + y2) >>> 0,
];
export const subtract = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    (x1 - x2) >>> 0,
    (y1 - y2) >>> 0,
];
export const scale = ([x, y]: Vec2_U32, s: number): Vec2_U32 => [(x * s) >>> 0, (y * s) >>> 0];
export const negate = ([x, y]: Vec2_U32): Vec2_U32 => [(-x) >>> 0, (-y) >>> 0];

export const min = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    Math.min(x1, x2) >>> 0,
    Math.min(y1, y2) >>> 0,
];
export const max = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    Math.max(x1, x2) >>> 0,
    Math.max(y1, y2) >>> 0,
];
export const clamp = (v: Vec2_U32, minVec: Vec2_U32, maxVec: Vec2_U32): Vec2_U32 => min(max(v, minVec), maxVec);

export const equals = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): boolean => x1 === x2 && y1 === y2;

export const bitwiseAnd = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    (x1 & x2) >>> 0,
    (y1 & y2) >>> 0,
];
export const bitwiseOr = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    (x1 | x2) >>> 0,
    (y1 | y2) >>> 0,
];
export const bitwiseXor = ([x1, y1]: Vec2_U32, [x2, y2]: Vec2_U32): Vec2_U32 => [
    (x1 ^ x2) >>> 0,
    (y1 ^ y2) >>> 0,
];
export const bitwiseNot = ([x, y]: Vec2_U32): Vec2_U32 => [(~x) >>> 0, (~y) >>> 0];
export const shiftLeft = ([x, y]: Vec2_U32, s: number): Vec2_U32 => [(x << s) >>> 0, (y << s) >>> 0];
export const shiftRight = ([x, y]: Vec2_U32, s: number): Vec2_U32 => [
    U32.shiftRight(x, s),
    U32.shiftRight(y, s),
];

export const countLeadingZeros = ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.countLeadingZeros(x),
    U32.countLeadingZeros(y),
];
export const countTrailingZeros = ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.countTrailingZeros(x),
    U32.countTrailingZeros(y),
];
export const countOneBits = ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.countOneBits(x),
    U32.countOneBits(y),
];
export const reverseBits = ([x, y]: Vec2_U32): Vec2_U32 => [
    U32.reverseBits(x),
    U32.reverseBits(y),
];
