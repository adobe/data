// © 2026 Adobe. MIT License. See /LICENSE for details.
import { createNumberBuffer } from "../typed-buffer/create-number-buffer.js";
import { createArrayBuffer } from "../typed-buffer/create-array-buffer.js";
import { createStructBuffer } from "../typed-buffer/create-struct-buffer.js";
import { F32 } from "../math/f32/index.js";
import type { Schema } from "../schema/index.js";
import type { PerformanceTest } from "./perf-test.js";

const Vec3Schema: Schema = {
    type: "object",
    properties: {
        x: F32.schema,
        y: F32.schema,
        z: F32.schema,
    },
    required: ["x", "y", "z"],
} as const;

type Vec3 = { x: number; y: number; z: number };

// number buffer get+set sweep — direct typed-array baseline through TypedBuffer.
const numberBufferGetSet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createNumberBuffer>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createNumberBuffer(F32.schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, i + 1);
        }
    };
    const run = () => {
        let total = 0;
        for (let i = 0; i < count; i++) {
            total += buffer.get(i);
        }
        sink ^= total | 0;
        for (let i = 0; i < count; i++) {
            buffer.set(i, buffer.get(i) + 1);
        }
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move" };
};

// array buffer get+set with object payloads — non-typed-array baseline.
const arrayBufferGetSet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createArrayBuffer<typeof Vec3Schema, Vec3>>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createArrayBuffer<typeof Vec3Schema, Vec3>(Vec3Schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, { x: i + 1, y: i + 1, z: i + 1 });
        }
    };
    const run = () => {
        let total = 0;
        for (let i = 0; i < count; i++) {
            const v = buffer.get(i);
            total += v.x + v.y + v.z;
        }
        sink ^= total | 0;
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move" };
};

// struct_get — read every element and accumulate a sink to defeat DCE.
const structBufferGet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createStructBuffer<typeof Vec3Schema>>;
    let count = 0;
    let sink = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createStructBuffer(Vec3Schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, { x: i + 1, y: i + 2, z: i + 3 });
        }
    };
    const run = () => {
        let total = 0;
        for (let i = 0; i < count; i++) {
            const v = buffer.get(i) as Vec3;
            total += v.x + v.y + v.z;
        }
        sink ^= total | 0;
    };
    const cleanup = async () => { sink = 0; };
    return { setup, run, cleanup, type: "move" };
};

// struct_set — write every element from a fixed literal.
const structBufferSet = (): PerformanceTest => {
    let buffer: ReturnType<typeof createStructBuffer<typeof Vec3Schema>>;
    let count = 0;
    const literal = { x: 1, y: 2, z: 3 };
    const setup = async (n: number) => {
        count = n;
        buffer = createStructBuffer(Vec3Schema, n);
    };
    const run = () => {
        for (let i = 0; i < count; i++) {
            buffer.set(i, literal);
        }
    };
    const cleanup = async () => { };
    return { setup, run, cleanup, type: "move" };
};

// struct_round_trip — get, mutate, set. Mirrors the per-frame ECS pattern.
const structBufferRoundTrip = (): PerformanceTest => {
    let buffer: ReturnType<typeof createStructBuffer<typeof Vec3Schema>>;
    let count = 0;
    const setup = async (n: number) => {
        count = n;
        buffer = createStructBuffer(Vec3Schema, n);
        for (let i = 0; i < n; i++) {
            buffer.set(i, { x: i + 1, y: i + 1, z: i + 1 });
        }
    };
    const run = () => {
        for (let i = 0; i < count; i++) {
            const v = buffer.get(i) as Vec3;
            v.x += 1;
            v.y += 1;
            v.z += 1;
            buffer.set(i, v);
        }
    };
    const cleanup = async () => { };
    return { setup, run, cleanup, type: "move" };
};

export const typed_buffer = {
    number_get_set: numberBufferGetSet(),
    array_get: arrayBufferGetSet(),
    struct_get: structBufferGet(),
    struct_set: structBufferSet(),
    struct_round_trip: structBufferRoundTrip(),
};
