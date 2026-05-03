// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createWriteStruct } from "./create-write-struct.js";
import { createDataView32 } from "../../internal/data-view-32/create-data-view-32.js";
import type { Schema } from "../../schema/index.js";
import { F32 } from "../../math/f32/index.js";
import { getStructLayout } from "./get-struct-layout.js";

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

describe("WriteStruct", () => {
    it("Vec2 array root", () => {
        const write = createWriteStruct(getStructLayout(vec2RootSchema));

        const data = createDataView32(new ArrayBuffer(16));
        write(data, 0, [1.5, 2.5]);
        expect(data.f32[0]).toBe(1.5);
        expect(data.f32[1]).toBe(2.5);

        write(data, 1, [3.5, 4.5]);
        expect(data.f32[2]).toBe(3.5);
        expect(data.f32[3]).toBe(4.5);
    });

    it("Vec2 object root", () => {
        const write = createWriteStruct(getStructLayout(vec2ObjectSchema));

        const data = createDataView32(new ArrayBuffer(16));
        write(data, 0, { x: 1.5, y: 2.5 });
        expect(data.f32[0]).toBe(1.5);
        expect(data.f32[1]).toBe(2.5);

        write(data, 1, { x: 3.5, y: 4.5 });
        expect(data.f32[2]).toBe(3.5);
        expect(data.f32[3]).toBe(4.5);
    });

    it("Complex struct with nested arrays and primitives", () => {
        const layout = getStructLayout(complexStructSchema);
        expect(layout.size).toBe(48);
        const write = createWriteStruct(layout);

        const data = createDataView32(new ArrayBuffer(96));

        write(data, 0, {
            position: [1, 2, 3],
            color: [1, 0, 0, 1],
            age: 42,
            charge: -5,
        });

        expect(data.f32[0]).toBe(1);
        expect(data.f32[1]).toBe(2);
        expect(data.f32[2]).toBe(3);
        expect(data.f32[4]).toBe(1);
        expect(data.f32[5]).toBe(0);
        expect(data.f32[6]).toBe(0);
        expect(data.f32[7]).toBe(1);
        expect(data.u32[8]).toBe(42);
        expect(data.i32[9]).toBe(-5);

        write(data, 1, {
            position: [4, 5, 6],
            color: [0, 1, 0, 1],
            age: 24,
            charge: 3,
        });

        expect(data.f32[12]).toBe(4);
        expect(data.f32[13]).toBe(5);
        expect(data.f32[14]).toBe(6);
        expect(data.f32[16]).toBe(0);
        expect(data.f32[17]).toBe(1);
        expect(data.f32[18]).toBe(0);
        expect(data.f32[19]).toBe(1);
        expect(data.u32[20]).toBe(24);
        expect(data.i32[21]).toBe(3);
    });

    it("should only destructure used view types", () => {
        const writeVec2 = createWriteStruct(getStructLayout(vec2RootSchema));
        expect(writeVec2.toString()).toMatch(/const { f32: __f32 } = data/);
        expect(writeVec2.toString()).not.toMatch(/i32: __i32/);
        expect(writeVec2.toString()).not.toMatch(/u32: __u32/);

        const writeMixed = createWriteStruct(getStructLayout(mixedPrimitivesSchema));
        expect(writeMixed.toString()).not.toMatch(/f32: __f32/);
        expect(writeMixed.toString()).toMatch(/const { (?=.*i32: __i32)(?=.*u32: __u32).*? } = data/);
    });
});
