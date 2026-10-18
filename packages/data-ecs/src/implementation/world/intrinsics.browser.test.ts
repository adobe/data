import { describe, expect, it } from "vitest";
import { Component } from "../../interface/component/component.js";
import { F32, Mat4x4, Quat, U32, Vec2, Vec3, Vec4 } from "../../interface/math/index.js";
import { System } from "../../interface/system/system.js";
import { readEach, select } from "./reads.test-helper.js";
import { createWorld } from "./create.js";
import { gpuDevice } from "../../interface/resources/gpu-device.js";
import { workers } from "../../interface/resources/workers.js";

const f2a = Symbol("intrinsicsTest/f2a");
const f2b = Symbol("intrinsicsTest/f2b");
const f2p = Symbol("intrinsicsTest/f2p");
const f2o = Symbol("intrinsicsTest/f2o");
const i2a = Symbol("intrinsicsTest/i2a");
const u2a = Symbol("intrinsicsTest/u2a");
const i2b = Symbol("intrinsicsTest/i2b");
const u2b = Symbol("intrinsicsTest/u2b");
const i2o = Symbol("intrinsicsTest/i2o");
const u2o = Symbol("intrinsicsTest/u2o");
const f3a = Symbol("intrinsicsTest/f3a");
const f3b = Symbol("intrinsicsTest/f3b");
const f3p = Symbol("intrinsicsTest/f3p");
const f3o = Symbol("intrinsicsTest/f3o");
const i3a = Symbol("intrinsicsTest/i3a");
const u3a = Symbol("intrinsicsTest/u3a");
const i3b = Symbol("intrinsicsTest/i3b");
const u3b = Symbol("intrinsicsTest/u3b");
const i3o = Symbol("intrinsicsTest/i3o");
const u3o = Symbol("intrinsicsTest/u3o");
const f4a = Symbol("intrinsicsTest/f4a");
const f4b = Symbol("intrinsicsTest/f4b");
const f4p = Symbol("intrinsicsTest/f4p");
const f4o = Symbol("intrinsicsTest/f4o");
const i4a = Symbol("intrinsicsTest/i4a");
const u4a = Symbol("intrinsicsTest/u4a");
const i4b = Symbol("intrinsicsTest/i4b");
const u4b = Symbol("intrinsicsTest/u4b");
const i4o = Symbol("intrinsicsTest/i4o");
const u4o = Symbol("intrinsicsTest/u4o");
const fo = Symbol("intrinsicsTest/fo");
const ma = Symbol("intrinsicsTest/ma");
const mb = Symbol("intrinsicsTest/mb");
const mo = Symbol("intrinsicsTest/mo");
const qa = Symbol("intrinsicsTest/qa");
const qb = Symbol("intrinsicsTest/qb");
const qo = Symbol("intrinsicsTest/qo");
const ua = Symbol("intrinsicsTest/ua");
const uo = Symbol("intrinsicsTest/uo");

declare module "@adobe/data-ecs" {
    export interface Components {
        [f2a]: { type: Vec2 };
        [f2b]: { type: Vec2 };
        [f2p]: { type: Vec2 };
        [f2o]: { type: Vec2 };
        [i2a]: { type: Vec2.I32 };
        [u2a]: { type: Vec2.U32 };
        [i2b]: { type: Vec2.I32 };
        [u2b]: { type: Vec2.U32 };
        [i2o]: { type: Vec2.I32 };
        [u2o]: { type: Vec2.U32 };
        [f3a]: { type: Vec3 };
        [f3b]: { type: Vec3 };
        [f3p]: { type: Vec3 };
        [f3o]: { type: Vec3 };
        [i3a]: { type: Vec3.I32 };
        [u3a]: { type: Vec3.U32 };
        [i3b]: { type: Vec3.I32 };
        [u3b]: { type: Vec3.U32 };
        [i3o]: { type: Vec3.I32 };
        [u3o]: { type: Vec3.U32 };
        [f4a]: { type: Vec4 };
        [f4b]: { type: Vec4 };
        [f4p]: { type: Vec4 };
        [f4o]: { type: Vec4 };
        [i4a]: { type: Vec4.I32 };
        [u4a]: { type: Vec4.U32 };
        [i4b]: { type: Vec4.I32 };
        [u4b]: { type: Vec4.U32 };
        [i4o]: { type: Vec4.I32 };
        [u4o]: { type: Vec4.U32 };
        [fo]: { type: F32 };
        [ma]: { type: Mat4x4 };
        [mb]: { type: Mat4x4 };
        [mo]: { type: Mat4x4 };
        [qa]: { type: Quat };
        [qb]: { type: Quat };
        [qo]: { type: Quat };
        [ua]: { type: U32 };
        [uo]: { type: U32 };
    }
}

Component.register(f2a, { type: Vec2.schema });
Component.register(f2b, { type: Vec2.schema });
Component.register(f2p, { type: Vec2.schema });
Component.register(f2o, { type: Vec2.schema });
Component.register(i2a, { type: Vec2.I32.schema });
Component.register(u2a, { type: Vec2.U32.schema });
Component.register(i2b, { type: Vec2.I32.schema });
Component.register(u2b, { type: Vec2.U32.schema });
Component.register(i2o, { type: Vec2.I32.schema });
Component.register(u2o, { type: Vec2.U32.schema });
Component.register(f3a, { type: Vec3.schema });
Component.register(f3b, { type: Vec3.schema });
Component.register(f3p, { type: Vec3.schema });
Component.register(f3o, { type: Vec3.schema });
Component.register(i3a, { type: Vec3.I32.schema });
Component.register(u3a, { type: Vec3.U32.schema });
Component.register(i3b, { type: Vec3.I32.schema });
Component.register(u3b, { type: Vec3.U32.schema });
Component.register(i3o, { type: Vec3.I32.schema });
Component.register(u3o, { type: Vec3.U32.schema });
Component.register(f4a, { type: Vec4.schema });
Component.register(f4b, { type: Vec4.schema });
Component.register(f4p, { type: Vec4.schema });
Component.register(f4o, { type: Vec4.schema });
Component.register(i4a, { type: Vec4.I32.schema });
Component.register(u4a, { type: Vec4.U32.schema });
Component.register(i4b, { type: Vec4.I32.schema });
Component.register(u4b, { type: Vec4.U32.schema });
Component.register(i4o, { type: Vec4.I32.schema });
Component.register(u4o, { type: Vec4.U32.schema });
Component.register(fo, { type: F32.schema });
Component.register(ma, { type: Mat4x4.schema });
Component.register(mb, { type: Mat4x4.schema });
Component.register(mo, { type: Mat4x4.schema });
Component.register(qa, { type: Quat.schema });
Component.register(qb, { type: Quat.schema });
Component.register(qo, { type: Quat.schema });
Component.register(ua, { type: U32.schema });
Component.register(uo, { type: U32.schema });

/** A value in [-1, 1) that differs per row and lane. */
const unit = (row: number, lane: number): number => ((Math.imul(row * 31 + lane * 7 + 1, 0x9E3779B9) >>> 0) / 2 ** 32) * 2 - 1;
const float = (seed: number) => (row: number, lane: number): number => unit(row + seed, lane) * 0.9;
const positive = (row: number, lane: number): number => Math.abs(float(500)(row, lane)) + 0.1;
const integer = (seed: number) => (row: number, lane: number): number => Math.imul(row * 977 + lane * 131 + seed, 0x9E3779B9) | 0;
const natural = (seed: number) => (row: number, lane: number): number => integer(seed)(row, lane) >>> 0;
const two = (row: number, value: (row: number, lane: number) => number): readonly [number, number] => [value(row, 0), value(row, 1)];
const three = (row: number, value: (row: number, lane: number) => number): readonly [number, number, number] => [value(row, 0), value(row, 1), value(row, 2)];
const four = (row: number, value: (row: number, lane: number) => number): readonly [number, number, number, number] => [value(row, 0), value(row, 1), value(row, 2), value(row, 3)];
const rows = 64;

const spawn = System.create({ name: "intrinsicsTest/spawn" }, ({ commands }) => {
    for (let i = 0; i < rows; i++) {
        commands.spawn({
            [f2a]: two(i, float(0)),
            [f2b]: two(i, float(100)),
            [f2p]: two(i, positive),
            [f2o]: two(i, float(0)),
            [i2a]: two(i, integer(1)),
            [i2b]: two(i, integer(2)),
            [i2o]: two(i, integer(0)),
            [u2a]: two(i, natural(3)),
            [u2b]: two(i, natural(4)),
            [u2o]: two(i, natural(0)),
            [f3a]: three(i, float(0)),
            [f3b]: three(i, float(100)),
            [f3p]: three(i, positive),
            [f3o]: three(i, float(0)),
            [i3a]: three(i, integer(1)),
            [i3b]: three(i, integer(2)),
            [i3o]: three(i, integer(0)),
            [u3a]: three(i, natural(3)),
            [u3b]: three(i, natural(4)),
            [u3o]: three(i, natural(0)),
            [f4a]: four(i, float(0)),
            [f4b]: four(i, float(100)),
            [f4p]: four(i, positive),
            [f4o]: four(i, float(0)),
            [i4a]: four(i, integer(1)),
            [i4b]: four(i, integer(2)),
            [i4o]: four(i, integer(0)),
            [u4a]: four(i, natural(3)),
            [u4b]: four(i, natural(4)),
            [u4o]: four(i, natural(0)),
            [fo]: 0,
            [ma]: Mat4x4.multiply(Mat4x4.translation(...three(i, float(200))), Mat4x4.rotationY(float(300)(i, 0))),
            [mb]: Mat4x4.scaling(...three(i, positive)),
            [mo]: Mat4x4.identity,
            [qa]: Quat.normalize(four(i, float(400))),
            [qb]: four(i, float(600)),
            [qo]: Quat.identity,
            [ua]: natural(5)(i, 0),
            [uo]: 0,
        });
    }
});

const operation = { type: "object", properties: { op: { type: "number" } } } as const;

const vec2f = System.create({ name: "intrinsicsTest/vec2f", kernel: "gpu", input: operation, components: { read: [f2a, f2b, f2p], write: [f2o] } }, (row, { input: { op } }) => {
    const a = row[f2a];
    const b = row[f2b];
    const p = row[f2p];
    if (op === 0) row[f2o] = Vec2.abs(a);
    else if (op === 1) row[f2o] = Vec2.acos(a);
    else if (op === 2) row[f2o] = Vec2.asin(a);
    else if (op === 3) row[f2o] = Vec2.asinh(a);
    else if (op === 4) row[f2o] = Vec2.atan(a);
    else if (op === 5) row[f2o] = Vec2.atanh(a);
    else if (op === 6) row[f2o] = Vec2.ceil(a);
    else if (op === 7) row[f2o] = Vec2.cos(a);
    else if (op === 8) row[f2o] = Vec2.cosh(a);
    else if (op === 9) row[f2o] = Vec2.exp(a);
    else if (op === 10) row[f2o] = Vec2.exp2(a);
    else if (op === 11) row[f2o] = Vec2.floor(a);
    else if (op === 12) row[f2o] = Vec2.fract(a);
    else if (op === 13) row[f2o] = Vec2.negate(a);
    else if (op === 14) row[f2o] = Vec2.normalize(a);
    else if (op === 15) row[f2o] = Vec2.round(a);
    else if (op === 16) row[f2o] = Vec2.sign(a);
    else if (op === 17) row[f2o] = Vec2.sin(a);
    else if (op === 18) row[f2o] = Vec2.sinh(a);
    else if (op === 19) row[f2o] = Vec2.tan(a);
    else if (op === 20) row[f2o] = Vec2.tanh(a);
    else if (op === 21) row[f2o] = Vec2.trunc(a);
    else if (op === 22) row[f2o] = Vec2.acosh(Vec2.add(p, [1, 1]));
    else if (op === 23) row[f2o] = Vec2.log(p);
    else if (op === 24) row[f2o] = Vec2.log2(p);
    else if (op === 25) row[f2o] = Vec2.sqrt(p);
    else if (op === 26) row[f2o] = Vec2.add(a, b);
    else if (op === 27) row[f2o] = Vec2.subtract(a, b);
    else if (op === 28) row[f2o] = Vec2.min(a, b);
    else if (op === 29) row[f2o] = Vec2.max(a, b);
    else if (op === 30) row[f2o] = Vec2.reflect(a, b);
    else if (op === 31) row[f2o] = Vec2.step(a, b);
    else if (op === 32) row[f2o] = Vec2.pow(p, b);
    else if (op === 33) row[f2o] = Vec2.scale(a, -1.5);
    else if (op === 34) row[f2o] = Vec2.mix(a, b, 0.25);
    else if (op === 35) row[f2o] = Vec2.refract(Vec2.normalize(a), Vec2.normalize(b), 0.5);
    else if (op === 36) row[f2o] = Vec2.clamp(a, [-0.5, -0.5], [0.5, 0.5]);
    else if (op === 37) row[f2o] = Vec2.smoothstep([-1, -1], [1, 1], a);
    else if (op === 38) row[f2o] = Vec2.faceforward(a, b, p);
});

const vec2fScalar = System.create({ name: "intrinsicsTest/vec2fScalar", kernel: "gpu", input: operation, components: { read: [f2a, f2b], write: [fo] } }, (row, { input: { op } }) => {
    const a = row[f2a];
    const b = row[f2b];
    if (op === 0) row[fo] = Vec2.dot(a, b);
    else if (op === 1) row[fo] = Vec2.distance(a, b);
    else if (op === 2) row[fo] = Vec2.length(a);
});

const vec2i = System.create({ name: "intrinsicsTest/vec2i", kernel: "gpu", input: operation, components: { read: [i2a, i2b], write: [i2o] } }, (row, { input: { op } }) => {
    const a = row[i2a];
    const b = row[i2b];
    if (op === 0) row[i2o] = Vec2.I32.add(a, b);
    else if (op === 1) row[i2o] = Vec2.I32.subtract(a, b);
    else if (op === 2) row[i2o] = Vec2.I32.min(a, b);
    else if (op === 3) row[i2o] = Vec2.I32.max(a, b);
    else if (op === 4) row[i2o] = Vec2.I32.bitwiseAnd(a, b);
    else if (op === 5) row[i2o] = Vec2.I32.bitwiseOr(a, b);
    else if (op === 6) row[i2o] = Vec2.I32.bitwiseXor(a, b);
    else if (op === 7) row[i2o] = Vec2.I32.negate(a);
    else if (op === 8) row[i2o] = Vec2.I32.abs(a);
    else if (op === 9) row[i2o] = Vec2.I32.bitwiseNot(a);
    else if (op === 10) row[i2o] = Vec2.I32.countLeadingZeros(a);
    else if (op === 11) row[i2o] = Vec2.I32.countOneBits(a);
    else if (op === 12) row[i2o] = Vec2.I32.countTrailingZeros(a);
    else if (op === 13) row[i2o] = Vec2.I32.reverseBits(a);
    else if (op === 14) row[i2o] = Vec2.I32.scale(a, -3);
    else if (op === 15) row[i2o] = Vec2.I32.clamp(a, [-1000, -1000], [1000, 1000]);
});

const vec2u = System.create({ name: "intrinsicsTest/vec2u", kernel: "gpu", input: operation, components: { read: [u2a, u2b], write: [u2o] } }, (row, { input: { op } }) => {
    const a = row[u2a];
    const b = row[u2b];
    if (op === 0) row[u2o] = Vec2.U32.add(a, b);
    else if (op === 1) row[u2o] = Vec2.U32.subtract(a, b);
    else if (op === 2) row[u2o] = Vec2.U32.min(a, b);
    else if (op === 3) row[u2o] = Vec2.U32.max(a, b);
    else if (op === 4) row[u2o] = Vec2.U32.bitwiseAnd(a, b);
    else if (op === 5) row[u2o] = Vec2.U32.bitwiseOr(a, b);
    else if (op === 6) row[u2o] = Vec2.U32.bitwiseXor(a, b);
    else if (op === 7) row[u2o] = Vec2.U32.bitwiseNot(a);
    else if (op === 8) row[u2o] = Vec2.U32.countLeadingZeros(a);
    else if (op === 9) row[u2o] = Vec2.U32.countOneBits(a);
    else if (op === 10) row[u2o] = Vec2.U32.countTrailingZeros(a);
    else if (op === 11) row[u2o] = Vec2.U32.reverseBits(a);
    else if (op === 12) row[u2o] = Vec2.U32.scale(a, 3);
    else if (op === 13) row[u2o] = Vec2.U32.clamp(a, [1000, 1000], [100000, 100000]);
});

const vec3f = System.create({ name: "intrinsicsTest/vec3f", kernel: "gpu", input: operation, components: { read: [f3a, f3b, f3p], write: [f3o] } }, (row, { input: { op } }) => {
    const a = row[f3a];
    const b = row[f3b];
    const p = row[f3p];
    if (op === 0) row[f3o] = Vec3.abs(a);
    else if (op === 1) row[f3o] = Vec3.acos(a);
    else if (op === 2) row[f3o] = Vec3.asin(a);
    else if (op === 3) row[f3o] = Vec3.asinh(a);
    else if (op === 4) row[f3o] = Vec3.atan(a);
    else if (op === 5) row[f3o] = Vec3.atanh(a);
    else if (op === 6) row[f3o] = Vec3.ceil(a);
    else if (op === 7) row[f3o] = Vec3.cos(a);
    else if (op === 8) row[f3o] = Vec3.cosh(a);
    else if (op === 9) row[f3o] = Vec3.exp(a);
    else if (op === 10) row[f3o] = Vec3.exp2(a);
    else if (op === 11) row[f3o] = Vec3.floor(a);
    else if (op === 12) row[f3o] = Vec3.fract(a);
    else if (op === 13) row[f3o] = Vec3.negate(a);
    else if (op === 14) row[f3o] = Vec3.normalize(a);
    else if (op === 15) row[f3o] = Vec3.round(a);
    else if (op === 16) row[f3o] = Vec3.sign(a);
    else if (op === 17) row[f3o] = Vec3.sin(a);
    else if (op === 18) row[f3o] = Vec3.sinh(a);
    else if (op === 19) row[f3o] = Vec3.tan(a);
    else if (op === 20) row[f3o] = Vec3.tanh(a);
    else if (op === 21) row[f3o] = Vec3.trunc(a);
    else if (op === 22) row[f3o] = Vec3.acosh(Vec3.add(p, [1, 1, 1]));
    else if (op === 23) row[f3o] = Vec3.log(p);
    else if (op === 24) row[f3o] = Vec3.log2(p);
    else if (op === 25) row[f3o] = Vec3.sqrt(p);
    else if (op === 26) row[f3o] = Vec3.add(a, b);
    else if (op === 27) row[f3o] = Vec3.subtract(a, b);
    else if (op === 28) row[f3o] = Vec3.multiply(a, b);
    else if (op === 29) row[f3o] = Vec3.min(a, b);
    else if (op === 30) row[f3o] = Vec3.max(a, b);
    else if (op === 31) row[f3o] = Vec3.reflect(a, b);
    else if (op === 32) row[f3o] = Vec3.step(a, b);
    else if (op === 33) row[f3o] = Vec3.cross(a, b);
    else if (op === 34) row[f3o] = Vec3.pow(p, b);
    else if (op === 35) row[f3o] = Vec3.scale(a, -1.5);
    else if (op === 36) row[f3o] = Vec3.mix(a, b, 0.25);
    else if (op === 37) row[f3o] = Vec3.refract(Vec3.normalize(a), Vec3.normalize(b), 0.5);
    else if (op === 38) row[f3o] = Vec3.clamp(a, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]);
    else if (op === 39) row[f3o] = Vec3.smoothstep([-1, -1, -1], [1, 1, 1], a);
    else if (op === 40) row[f3o] = Vec3.faceforward(a, b, p);
});

const vec3fScalar = System.create({ name: "intrinsicsTest/vec3fScalar", kernel: "gpu", input: operation, components: { read: [f3a, f3b], write: [fo] } }, (row, { input: { op } }) => {
    const a = row[f3a];
    const b = row[f3b];
    if (op === 0) row[fo] = Vec3.dot(a, b);
    else if (op === 1) row[fo] = Vec3.distance(a, b);
    else if (op === 2) row[fo] = Vec3.length(a);
});

const vec3i = System.create({ name: "intrinsicsTest/vec3i", kernel: "gpu", input: operation, components: { read: [i3a, i3b], write: [i3o] } }, (row, { input: { op } }) => {
    const a = row[i3a];
    const b = row[i3b];
    if (op === 0) row[i3o] = Vec3.I32.add(a, b);
    else if (op === 1) row[i3o] = Vec3.I32.subtract(a, b);
    else if (op === 2) row[i3o] = Vec3.I32.multiply(a, b);
    else if (op === 3) row[i3o] = Vec3.I32.min(a, b);
    else if (op === 4) row[i3o] = Vec3.I32.max(a, b);
    else if (op === 5) row[i3o] = Vec3.I32.bitwiseAnd(a, b);
    else if (op === 6) row[i3o] = Vec3.I32.bitwiseOr(a, b);
    else if (op === 7) row[i3o] = Vec3.I32.bitwiseXor(a, b);
    else if (op === 8) row[i3o] = Vec3.I32.negate(a);
    else if (op === 9) row[i3o] = Vec3.I32.abs(a);
    else if (op === 10) row[i3o] = Vec3.I32.bitwiseNot(a);
    else if (op === 11) row[i3o] = Vec3.I32.countLeadingZeros(a);
    else if (op === 12) row[i3o] = Vec3.I32.countOneBits(a);
    else if (op === 13) row[i3o] = Vec3.I32.countTrailingZeros(a);
    else if (op === 14) row[i3o] = Vec3.I32.reverseBits(a);
    else if (op === 15) row[i3o] = Vec3.I32.scale(a, -3);
    else if (op === 16) row[i3o] = Vec3.I32.clamp(a, [-1000, -1000, -1000], [1000, 1000, 1000]);
});

const vec3u = System.create({ name: "intrinsicsTest/vec3u", kernel: "gpu", input: operation, components: { read: [u3a, u3b], write: [u3o] } }, (row, { input: { op } }) => {
    const a = row[u3a];
    const b = row[u3b];
    if (op === 0) row[u3o] = Vec3.U32.add(a, b);
    else if (op === 1) row[u3o] = Vec3.U32.subtract(a, b);
    else if (op === 2) row[u3o] = Vec3.U32.multiply(a, b);
    else if (op === 3) row[u3o] = Vec3.U32.min(a, b);
    else if (op === 4) row[u3o] = Vec3.U32.max(a, b);
    else if (op === 5) row[u3o] = Vec3.U32.bitwiseAnd(a, b);
    else if (op === 6) row[u3o] = Vec3.U32.bitwiseOr(a, b);
    else if (op === 7) row[u3o] = Vec3.U32.bitwiseXor(a, b);
    else if (op === 8) row[u3o] = Vec3.U32.bitwiseNot(a);
    else if (op === 9) row[u3o] = Vec3.U32.countLeadingZeros(a);
    else if (op === 10) row[u3o] = Vec3.U32.countOneBits(a);
    else if (op === 11) row[u3o] = Vec3.U32.countTrailingZeros(a);
    else if (op === 12) row[u3o] = Vec3.U32.reverseBits(a);
    else if (op === 13) row[u3o] = Vec3.U32.scale(a, 3);
    else if (op === 14) row[u3o] = Vec3.U32.clamp(a, [1000, 1000, 1000], [100000, 100000, 100000]);
});

const vec4f = System.create({ name: "intrinsicsTest/vec4f", kernel: "gpu", input: operation, components: { read: [f4a, f4b, f4p], write: [f4o] } }, (row, { input: { op } }) => {
    const a = row[f4a];
    const b = row[f4b];
    const p = row[f4p];
    if (op === 0) row[f4o] = Vec4.abs(a);
    else if (op === 1) row[f4o] = Vec4.acos(a);
    else if (op === 2) row[f4o] = Vec4.asin(a);
    else if (op === 3) row[f4o] = Vec4.asinh(a);
    else if (op === 4) row[f4o] = Vec4.atan(a);
    else if (op === 5) row[f4o] = Vec4.atanh(a);
    else if (op === 6) row[f4o] = Vec4.ceil(a);
    else if (op === 7) row[f4o] = Vec4.cos(a);
    else if (op === 8) row[f4o] = Vec4.cosh(a);
    else if (op === 9) row[f4o] = Vec4.exp(a);
    else if (op === 10) row[f4o] = Vec4.exp2(a);
    else if (op === 11) row[f4o] = Vec4.floor(a);
    else if (op === 12) row[f4o] = Vec4.fract(a);
    else if (op === 13) row[f4o] = Vec4.negate(a);
    else if (op === 14) row[f4o] = Vec4.normalize(a);
    else if (op === 15) row[f4o] = Vec4.round(a);
    else if (op === 16) row[f4o] = Vec4.sign(a);
    else if (op === 17) row[f4o] = Vec4.sin(a);
    else if (op === 18) row[f4o] = Vec4.sinh(a);
    else if (op === 19) row[f4o] = Vec4.tan(a);
    else if (op === 20) row[f4o] = Vec4.tanh(a);
    else if (op === 21) row[f4o] = Vec4.trunc(a);
    else if (op === 22) row[f4o] = Vec4.acosh(Vec4.add(p, [1, 1, 1, 1]));
    else if (op === 23) row[f4o] = Vec4.log(p);
    else if (op === 24) row[f4o] = Vec4.log2(p);
    else if (op === 25) row[f4o] = Vec4.sqrt(p);
    else if (op === 26) row[f4o] = Vec4.add(a, b);
    else if (op === 27) row[f4o] = Vec4.subtract(a, b);
    else if (op === 28) row[f4o] = Vec4.multiply(a, b);
    else if (op === 29) row[f4o] = Vec4.min(a, b);
    else if (op === 30) row[f4o] = Vec4.max(a, b);
    else if (op === 31) row[f4o] = Vec4.reflect(a, b);
    else if (op === 32) row[f4o] = Vec4.step(a, b);
    else if (op === 33) row[f4o] = Vec4.pow(p, b);
    else if (op === 34) row[f4o] = Vec4.scale(a, -1.5);
    else if (op === 35) row[f4o] = Vec4.mix(a, b, 0.25);
    else if (op === 36) row[f4o] = Vec4.refract(Vec4.normalize(a), Vec4.normalize(b), 0.5);
    else if (op === 37) row[f4o] = Vec4.clamp(a, [-0.5, -0.5, -0.5, -0.5], [0.5, 0.5, 0.5, 0.5]);
    else if (op === 38) row[f4o] = Vec4.smoothstep([-1, -1, -1, -1], [1, 1, 1, 1], a);
    else if (op === 39) row[f4o] = Vec4.faceforward(a, b, p);
});

const vec4fScalar = System.create({ name: "intrinsicsTest/vec4fScalar", kernel: "gpu", input: operation, components: { read: [f4a, f4b], write: [fo] } }, (row, { input: { op } }) => {
    const a = row[f4a];
    const b = row[f4b];
    if (op === 0) row[fo] = Vec4.dot(a, b);
    else if (op === 1) row[fo] = Vec4.distance(a, b);
    else if (op === 2) row[fo] = Vec4.length(a);
});

const vec4i = System.create({ name: "intrinsicsTest/vec4i", kernel: "gpu", input: operation, components: { read: [i4a, i4b], write: [i4o] } }, (row, { input: { op } }) => {
    const a = row[i4a];
    const b = row[i4b];
    if (op === 0) row[i4o] = Vec4.I32.add(a, b);
    else if (op === 1) row[i4o] = Vec4.I32.subtract(a, b);
    else if (op === 2) row[i4o] = Vec4.I32.multiply(a, b);
    else if (op === 3) row[i4o] = Vec4.I32.min(a, b);
    else if (op === 4) row[i4o] = Vec4.I32.max(a, b);
    else if (op === 5) row[i4o] = Vec4.I32.bitwiseAnd(a, b);
    else if (op === 6) row[i4o] = Vec4.I32.bitwiseOr(a, b);
    else if (op === 7) row[i4o] = Vec4.I32.bitwiseXor(a, b);
    else if (op === 8) row[i4o] = Vec4.I32.negate(a);
    else if (op === 9) row[i4o] = Vec4.I32.abs(a);
    else if (op === 10) row[i4o] = Vec4.I32.bitwiseNot(a);
    else if (op === 11) row[i4o] = Vec4.I32.countLeadingZeros(a);
    else if (op === 12) row[i4o] = Vec4.I32.countOneBits(a);
    else if (op === 13) row[i4o] = Vec4.I32.countTrailingZeros(a);
    else if (op === 14) row[i4o] = Vec4.I32.reverseBits(a);
    else if (op === 15) row[i4o] = Vec4.I32.scale(a, -3);
    else if (op === 16) row[i4o] = Vec4.I32.clamp(a, [-1000, -1000, -1000, -1000], [1000, 1000, 1000, 1000]);
});

const vec4u = System.create({ name: "intrinsicsTest/vec4u", kernel: "gpu", input: operation, components: { read: [u4a, u4b], write: [u4o] } }, (row, { input: { op } }) => {
    const a = row[u4a];
    const b = row[u4b];
    if (op === 0) row[u4o] = Vec4.U32.add(a, b);
    else if (op === 1) row[u4o] = Vec4.U32.subtract(a, b);
    else if (op === 2) row[u4o] = Vec4.U32.multiply(a, b);
    else if (op === 3) row[u4o] = Vec4.U32.min(a, b);
    else if (op === 4) row[u4o] = Vec4.U32.max(a, b);
    else if (op === 5) row[u4o] = Vec4.U32.bitwiseAnd(a, b);
    else if (op === 6) row[u4o] = Vec4.U32.bitwiseOr(a, b);
    else if (op === 7) row[u4o] = Vec4.U32.bitwiseXor(a, b);
    else if (op === 8) row[u4o] = Vec4.U32.bitwiseNot(a);
    else if (op === 9) row[u4o] = Vec4.U32.countLeadingZeros(a);
    else if (op === 10) row[u4o] = Vec4.U32.countOneBits(a);
    else if (op === 11) row[u4o] = Vec4.U32.countTrailingZeros(a);
    else if (op === 12) row[u4o] = Vec4.U32.reverseBits(a);
    else if (op === 13) row[u4o] = Vec4.U32.scale(a, 3);
    else if (op === 14) row[u4o] = Vec4.U32.clamp(a, [1000, 1000, 1000, 1000], [100000, 100000, 100000, 100000]);
});

const mat4x4 = System.create({ name: "intrinsicsTest/mat4x4", kernel: "gpu", input: operation, components: { read: [ma, mb], write: [mo] } }, (row, { input: { op } }) => {
    const a = row[ma];
    const b = row[mb];
    if (op === 0) row[mo] = Mat4x4.multiply(a, b);
    else if (op === 1) row[mo] = Mat4x4.transpose(a);
    else if (op === 2) row[mo] = Mat4x4.add(a, b);
    else if (op === 3) row[mo] = Mat4x4.subtract(a, b);
    else if (op === 4) row[mo] = Mat4x4.scale(a, 0.5);
});

const mat4x4Vector = System.create({ name: "intrinsicsTest/mat4x4Vector", kernel: "gpu", input: operation, components: { read: [ma, f4a], write: [f4o] } }, (row, { input: { op } }) => {
    const a = row[ma];
    const b = row[f4a];
    if (op === 0) row[f4o] = Mat4x4.multiplyVec4(a, b);
});

const mat4x4Scalar = System.create({ name: "intrinsicsTest/mat4x4Scalar", kernel: "gpu", input: operation, components: { read: [ma], write: [fo] } }, (row, { input: { op } }) => {
    const a = row[ma];
    if (op === 0) row[fo] = Mat4x4.determinant(a);
});

const quat = System.create({ name: "intrinsicsTest/quat", kernel: "gpu", input: operation, components: { read: [qa, qb], write: [qo] } }, (row, { input: { op } }) => {
    const a = row[qa];
    const b = row[qb];
    if (op === 0) row[qo] = Quat.add(a, b);
    else if (op === 1) row[qo] = Quat.subtract(a, b);
    else if (op === 2) row[qo] = Quat.scale(a, 2);
    else if (op === 3) row[qo] = Quat.negate(a);
});

const quatScalar = System.create({ name: "intrinsicsTest/quatScalar", kernel: "gpu", input: operation, components: { read: [qa, qb], write: [fo] } }, (row, { input: { op } }) => {
    const a = row[qa];
    const b = row[qb];
    if (op === 0) row[fo] = Quat.dot(a, b);
    else if (op === 1) row[fo] = Quat.length(a);
});

const u32 = System.create({ name: "intrinsicsTest/u32", kernel: "gpu", input: operation, components: { read: [ua], write: [uo] } }, (row, { input: { op } }) => {
    const a = row[ua];
    if (op === 0) row[uo] = U32.countLeadingZeros(a);
    else if (op === 1) row[uo] = U32.countOneBits(a);
    else if (op === 2) row[uo] = U32.countTrailingZeros(a);
    else if (op === 3) row[uo] = U32.reverseBits(a);
});

/** A class of declared builtins: its kernel, the functions it selects between by `op`, and what it writes. */
const testCase = <S, O extends symbol>(system: S, operations: readonly string[], output: O, exact: boolean) => ({ system, operations, output, exact });

const cases = [
    testCase(vec2f, ["Vec2.abs", "Vec2.acos", "Vec2.asin", "Vec2.asinh", "Vec2.atan", "Vec2.atanh", "Vec2.ceil", "Vec2.cos", "Vec2.cosh", "Vec2.exp", "Vec2.exp2", "Vec2.floor", "Vec2.fract", "Vec2.negate", "Vec2.normalize", "Vec2.round", "Vec2.sign", "Vec2.sin", "Vec2.sinh", "Vec2.tan", "Vec2.tanh", "Vec2.trunc", "Vec2.acosh", "Vec2.log", "Vec2.log2", "Vec2.sqrt", "Vec2.add", "Vec2.subtract", "Vec2.min", "Vec2.max", "Vec2.reflect", "Vec2.step", "Vec2.pow", "Vec2.scale", "Vec2.mix", "Vec2.refract", "Vec2.clamp", "Vec2.smoothstep", "Vec2.faceforward"], f2o, false),
    testCase(vec2fScalar, ["Vec2.dot", "Vec2.distance", "Vec2.length"], fo, false),
    testCase(vec2i, ["Vec2.I32.add", "Vec2.I32.subtract", "Vec2.I32.min", "Vec2.I32.max", "Vec2.I32.bitwiseAnd", "Vec2.I32.bitwiseOr", "Vec2.I32.bitwiseXor", "Vec2.I32.negate", "Vec2.I32.abs", "Vec2.I32.bitwiseNot", "Vec2.I32.countLeadingZeros", "Vec2.I32.countOneBits", "Vec2.I32.countTrailingZeros", "Vec2.I32.reverseBits", "Vec2.I32.scale", "Vec2.I32.clamp"], i2o, true),
    testCase(vec2u, ["Vec2.U32.add", "Vec2.U32.subtract", "Vec2.U32.min", "Vec2.U32.max", "Vec2.U32.bitwiseAnd", "Vec2.U32.bitwiseOr", "Vec2.U32.bitwiseXor", "Vec2.U32.bitwiseNot", "Vec2.U32.countLeadingZeros", "Vec2.U32.countOneBits", "Vec2.U32.countTrailingZeros", "Vec2.U32.reverseBits", "Vec2.U32.scale", "Vec2.U32.clamp"], u2o, true),
    testCase(vec3f, ["Vec3.abs", "Vec3.acos", "Vec3.asin", "Vec3.asinh", "Vec3.atan", "Vec3.atanh", "Vec3.ceil", "Vec3.cos", "Vec3.cosh", "Vec3.exp", "Vec3.exp2", "Vec3.floor", "Vec3.fract", "Vec3.negate", "Vec3.normalize", "Vec3.round", "Vec3.sign", "Vec3.sin", "Vec3.sinh", "Vec3.tan", "Vec3.tanh", "Vec3.trunc", "Vec3.acosh", "Vec3.log", "Vec3.log2", "Vec3.sqrt", "Vec3.add", "Vec3.subtract", "Vec3.multiply", "Vec3.min", "Vec3.max", "Vec3.reflect", "Vec3.step", "Vec3.cross", "Vec3.pow", "Vec3.scale", "Vec3.mix", "Vec3.refract", "Vec3.clamp", "Vec3.smoothstep", "Vec3.faceforward"], f3o, false),
    testCase(vec3fScalar, ["Vec3.dot", "Vec3.distance", "Vec3.length"], fo, false),
    testCase(vec3i, ["Vec3.I32.add", "Vec3.I32.subtract", "Vec3.I32.multiply", "Vec3.I32.min", "Vec3.I32.max", "Vec3.I32.bitwiseAnd", "Vec3.I32.bitwiseOr", "Vec3.I32.bitwiseXor", "Vec3.I32.negate", "Vec3.I32.abs", "Vec3.I32.bitwiseNot", "Vec3.I32.countLeadingZeros", "Vec3.I32.countOneBits", "Vec3.I32.countTrailingZeros", "Vec3.I32.reverseBits", "Vec3.I32.scale", "Vec3.I32.clamp"], i3o, true),
    testCase(vec3u, ["Vec3.U32.add", "Vec3.U32.subtract", "Vec3.U32.multiply", "Vec3.U32.min", "Vec3.U32.max", "Vec3.U32.bitwiseAnd", "Vec3.U32.bitwiseOr", "Vec3.U32.bitwiseXor", "Vec3.U32.bitwiseNot", "Vec3.U32.countLeadingZeros", "Vec3.U32.countOneBits", "Vec3.U32.countTrailingZeros", "Vec3.U32.reverseBits", "Vec3.U32.scale", "Vec3.U32.clamp"], u3o, true),
    testCase(vec4f, ["Vec4.abs", "Vec4.acos", "Vec4.asin", "Vec4.asinh", "Vec4.atan", "Vec4.atanh", "Vec4.ceil", "Vec4.cos", "Vec4.cosh", "Vec4.exp", "Vec4.exp2", "Vec4.floor", "Vec4.fract", "Vec4.negate", "Vec4.normalize", "Vec4.round", "Vec4.sign", "Vec4.sin", "Vec4.sinh", "Vec4.tan", "Vec4.tanh", "Vec4.trunc", "Vec4.acosh", "Vec4.log", "Vec4.log2", "Vec4.sqrt", "Vec4.add", "Vec4.subtract", "Vec4.multiply", "Vec4.min", "Vec4.max", "Vec4.reflect", "Vec4.step", "Vec4.pow", "Vec4.scale", "Vec4.mix", "Vec4.refract", "Vec4.clamp", "Vec4.smoothstep", "Vec4.faceforward"], f4o, false),
    testCase(vec4fScalar, ["Vec4.dot", "Vec4.distance", "Vec4.length"], fo, false),
    testCase(vec4i, ["Vec4.I32.add", "Vec4.I32.subtract", "Vec4.I32.multiply", "Vec4.I32.min", "Vec4.I32.max", "Vec4.I32.bitwiseAnd", "Vec4.I32.bitwiseOr", "Vec4.I32.bitwiseXor", "Vec4.I32.negate", "Vec4.I32.abs", "Vec4.I32.bitwiseNot", "Vec4.I32.countLeadingZeros", "Vec4.I32.countOneBits", "Vec4.I32.countTrailingZeros", "Vec4.I32.reverseBits", "Vec4.I32.scale", "Vec4.I32.clamp"], i4o, true),
    testCase(vec4u, ["Vec4.U32.add", "Vec4.U32.subtract", "Vec4.U32.multiply", "Vec4.U32.min", "Vec4.U32.max", "Vec4.U32.bitwiseAnd", "Vec4.U32.bitwiseOr", "Vec4.U32.bitwiseXor", "Vec4.U32.bitwiseNot", "Vec4.U32.countLeadingZeros", "Vec4.U32.countOneBits", "Vec4.U32.countTrailingZeros", "Vec4.U32.reverseBits", "Vec4.U32.scale", "Vec4.U32.clamp"], u4o, true),
    testCase(mat4x4, ["Mat4x4.multiply", "Mat4x4.transpose", "Mat4x4.add", "Mat4x4.subtract", "Mat4x4.scale"], mo, false),
    testCase(mat4x4Vector, ["Mat4x4.multiplyVec4"], f4o, false),
    testCase(mat4x4Scalar, ["Mat4x4.determinant"], fo, false),
    testCase(quat, ["Quat.add", "Quat.subtract", "Quat.scale", "Quat.negate"], qo, false),
    testCase(quatScalar, ["Quat.dot", "Quat.length"], fo, false),
    testCase(u32, ["U32.countLeadingZeros", "U32.countOneBits", "U32.countTrailingZeros", "U32.reverseBits"], uo, true),
];

const device = async (): Promise<GPUDevice> => {
    const adapter = await navigator.gpu.requestAdapter();
    if (adapter === null) throw new Error("No WebGPU adapter.");
    return adapter.requestDevice();
};

describe("declared WGSL builtins", () => {
    it("give on the GPU what their functions give on the CPU", async () => {
        const gpuWorld = createWorld({ [gpuDevice]: await device() });
        const cpuWorld = createWorld({ [workers]: 0 });
        for (const world of [gpuWorld, cpuWorld]) {
            await world.run(spawn);
        }
        const values = async (world: ReturnType<typeof createWorld>, output: (typeof cases)[number]["output"]): Promise<number[]> =>
            (await readEach(world, await select(world, { required: [output] }), output)).flatMap((value: unknown) =>
                Array.isArray(value) ? value.map(Number) : [Number(value)]);
        const mismatches: string[] = [];
        for (const { system, operations, output, exact } of cases) {
            for (let op = 0; op < operations.length; op++) {
                for (const world of [gpuWorld, cpuWorld]) await world.run(system, { op });
                const gpu = await values(gpuWorld, output);
                const cpu = await values(cpuWorld, output);
                const worst = Math.max(...gpu.map((value, i) => exact ? (value === cpu[i] ? 0 : Infinity) : Math.abs(value - (cpu[i] ?? NaN)) / Math.max(1, Math.abs(cpu[i] ?? NaN))));
                if (gpu.length !== cpu.length || !(worst <= 1e-4)) mismatches.push(`${operations[op]}: ${worst}`);
            }
        }
        expect(mismatches).toEqual([]);
        await gpuWorld.dispose();
        await cpuWorld.dispose();
    });
});
