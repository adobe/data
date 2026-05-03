// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createReadStruct } from "./create-read-struct.js";
import { createDataView32 } from "../../internal/data-view-32/create-data-view-32.js";
import type { Schema } from "../../schema/index.js";
import { F32 } from "../../math/f32/index.js";
import { getStructLayout } from "./get-struct-layout.js";

/** Root vec2 — same shape as `Vec2.schema` but as a root array for TypedBuffer-style roots. */
const vec2RootSchema = {
    type: "array",
    items: { type: "number", precision: 1 },
    minItems: 2,
    maxItems: 2,
} as const satisfies Schema;

const vec2ObjectSchema = {
    type: "object",
    properties: {
        x: F32.schema,
        y: F32.schema,
    },
} as const satisfies Schema;

const complexStructSchema = {
    type: "object",
    properties: {
        position: {
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 3,
            maxItems: 3,
        },
        color: {
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 4,
            maxItems: 4,
        },
        age: { type: "integer", minimum: 0, maximum: 4294967295 },
        charge: { type: "integer", minimum: -2147483648, maximum: 2147483647 },
    },
} as const satisfies Schema;

const mixedPrimitivesSchema = {
    type: "object",
    properties: {
        a: { type: "integer", minimum: -2147483648, maximum: 2147483647 },
        b: { type: "integer", minimum: 0, maximum: 4294967295 },
    },
} as const satisfies Schema;

describe("ReadStruct", () => {
    it("Vec2 array root", () => {
        const layout = getStructLayout(vec2RootSchema);
        const read = createReadStruct(layout);

        const data = createDataView32(new ArrayBuffer(16));
        data.f32[0] = 1.5;
        data.f32[1] = 2.5;
        data.f32[2] = 3.5;
        data.f32[3] = 4.5;
        const result = read(data, 0);
        expect(result).toEqual([1.5, 2.5]);

        const result2 = read(data, 1);
        expect(result2).toEqual([3.5, 4.5]);
    });

    it("Vec2 object root", () => {
        const layout = getStructLayout(vec2ObjectSchema);
        const read = createReadStruct(layout);

        const data = createDataView32(new ArrayBuffer(16));
        data.f32[0] = 1.5;
        data.f32[1] = 2.5;
        data.f32[2] = 3.5;
        data.f32[3] = 4.5;
        const result = read(data, 0);
        expect(result).toEqual({ x: 1.5, y: 2.5 });

        const result2 = read(data, 1);
        expect(result2).toEqual({ x: 3.5, y: 4.5 });
    });

    it("Complex struct with nested arrays and primitives", () => {
        const layout = getStructLayout(complexStructSchema);
        expect(layout.size).toBe(48);
        const read = createReadStruct(layout);

        const data = createDataView32(new ArrayBuffer(96));
        data.f32[0] = 1;
        data.f32[1] = 2;
        data.f32[2] = 3;
        data.f32[4] = 1;
        data.f32[5] = 0;
        data.f32[6] = 0;
        data.f32[7] = 1;
        data.u32[8] = 42;
        data.i32[9] = -5;

        data.f32[12] = 4;
        data.f32[13] = 5;
        data.f32[14] = 6;
        data.f32[16] = 0;
        data.f32[17] = 1;
        data.f32[18] = 0;
        data.f32[19] = 1;
        data.u32[20] = 24;
        data.i32[21] = 3;

        const result = read(data, 0);
        expect(result).toEqual({
            position: [1, 2, 3],
            color: [1, 0, 0, 1],
            age: 42,
            charge: -5,
        });

        const result2 = read(data, 1);
        expect(result2).toEqual({
            position: [4, 5, 6],
            color: [0, 1, 0, 1],
            age: 24,
            charge: 3,
        });
    });

    it("should only destructure used view types", () => {
        const readVec2 = createReadStruct(getStructLayout(vec2RootSchema));
        expect(readVec2.toString()).toMatch(/const { f32: __f32 } = data/);
        expect(readVec2.toString()).not.toMatch(/i32: __i32/);
        expect(readVec2.toString()).not.toMatch(/u32: __u32/);

        const readMixed = createReadStruct(getStructLayout(mixedPrimitivesSchema));
        expect(readMixed.toString()).not.toMatch(/f32: __f32/);
        expect(readMixed.toString()).toMatch(/const { (?=.*i32: __i32)(?=.*u32: __u32).*? } = data/);
    });
});
