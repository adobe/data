// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { F32 as Vec2F32 } from "./f32/f32.js";
import type { I32 as Vec2I32 } from "./i32/i32.js";
import type { U32 as Vec2U32 } from "./u32/u32.js";
import * as Public from "./public.js";

export type Vec2 = Vec2F32;

export namespace Vec2 {
    export type F32 = Vec2F32;
    export type U32 = Vec2U32;
    export type I32 = Vec2I32;

    export import F32 = Public.F32;
    export import U32 = Public.U32;
    export import I32 = Public.I32;

    // Backwards compatibility: Vec2 is synonymous with Vec2.F32
    export import schema = Public.schema;
    export import layout = Public.layout;
    export import abs = Public.abs;
    export import acos = Public.acos;
    export import acosh = Public.acosh;
    export import add = Public.add;
    export import asin = Public.asin;
    export import asinh = Public.asinh;
    export import atan = Public.atan;
    export import atanh = Public.atanh;
    export import ceil = Public.ceil;
    export import clamp = Public.clamp;
    export import cos = Public.cos;
    export import cosh = Public.cosh;
    export import distance = Public.distance;
    export import dot = Public.dot;
    export import equals = Public.equals;
    export import exp = Public.exp;
    export import exp2 = Public.exp2;
    export import faceforward = Public.faceforward;
    export import floor = Public.floor;
    export import fract = Public.fract;
    export import length = Public.length;
    export import log = Public.log;
    export import log2 = Public.log2;
    export import max = Public.max;
    export import min = Public.min;
    export import mix = Public.mix;
    export import mod = Public.mod;
    export import modf = Public.modf;
    export import negate = Public.negate;
    export import normalize = Public.normalize;
    export import pow = Public.pow;
    export import reflect = Public.reflect;
    export import refract = Public.refract;
    export import round = Public.round;
    export import scale = Public.scale;
    export import sign = Public.sign;
    export import sin = Public.sin;
    export import sinh = Public.sinh;
    export import smoothstep = Public.smoothstep;
    export import sqrt = Public.sqrt;
    export import step = Public.step;
    export import subtract = Public.subtract;
    export import tan = Public.tan;
    export import tanh = Public.tanh;
    export import trunc = Public.trunc;
    export import zero = Public.zero;
}
