// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createReadStruct } from "./create-read-struct.js";
import { createDataView32 } from "../../internal/data-view-32/create-data-view-32.js";
import type { StructLayout } from "./struct-layout.js";

describe("ReadStruct", () => {
    it("Vec2 array root", () => {
        const layout = {
            "type": "array",
            "size": 8,
            "fields": {
                "0": {
                    "offset": 0,
                    "type": "f32"
                },
                "1": {
                    "offset": 4,
                    "type": "f32"
                }
            }
        } as const satisfies StructLayout;
        const read = createReadStruct(layout);

        const data = createDataView32(new ArrayBuffer(16));
        data.f32[0] = 1.5;
        data.f32[1] = 2.5;
        data.f32[2] = 3.5;
        data.f32[3] = 4.5;
        const result = read(data, 0);
        expect(result).toEqual([1.5, 2.5]);

        // Test with offset
        const result2 = read(data, 1);
        expect(result2).toEqual([3.5, 4.5]);
    });

    it("Vec2 object root", () => {
        const layout = {
            "type": "object",
            "size": 8,
            "fields": {
                "x": {
                    "offset": 0,
                    "type": "f32"
                },
                "y": {
                    "offset": 4,
                    "type": "f32"
                }
            }
        } as const satisfies StructLayout;
        const read = createReadStruct(layout);

        const data = createDataView32(new ArrayBuffer(16));
        data.f32[0] = 1.5;
        data.f32[1] = 2.5;
        data.f32[2] = 3.5;
        data.f32[3] = 4.5;
        const result = read(data, 0);
        expect(result).toEqual({ x: 1.5, y: 2.5 });

        // Test with offset
        const result2 = read(data, 1);
        expect(result2).toEqual({ x: 3.5, y: 4.5 });
    });

    it("Complex struct with nested arrays and primitives", () => {
        const layout = {
            type: "object",
            size: 48,  // Total size rounded to vec4 (16 bytes)
            fields: {
                position: {
                    offset: 0,
                    type: {
                        type: "array",
                        size: 16,  // vec3 padded to vec4
                        fields: {
                            "0": { offset: 0, type: "f32" },
                            "1": { offset: 4, type: "f32" },
                            "2": { offset: 8, type: "f32" }
                        }
                    }
                },
                color: {
                    offset: 16,  // Aligned to vec4
                    type: {
                        type: "array",
                        size: 16,
                        fields: {
                            "0": { offset: 0, type: "f32" },
                            "1": { offset: 4, type: "f32" },
                            "2": { offset: 8, type: "f32" },
                            "3": { offset: 12, type: "f32" }
                        }
                    }
                },
                age: {
                    offset: 32,  // Aligned to vec4
                    type: "u32"
                },
                charge: {
                    offset: 36,
                    type: "i32"
                }
            }
        } as const satisfies StructLayout;
        const read = createReadStruct(layout);

        const data = createDataView32(new ArrayBuffer(96));  // Space for 2 structs
        // position
        data.f32[0] = 1;
        data.f32[1] = 2;
        data.f32[2] = 3;
        // color
        data.f32[4] = 1;
        data.f32[5] = 0;
        data.f32[6] = 0;
        data.f32[7] = 1;
        // age
        data.u32[8] = 42;
        // charge
        data.i32[9] = -5;

        // Second struct for offset testing
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
            charge: -5
        });

        // Test with offset
        const result2 = read(data, 1);
        expect(result2).toEqual({
            position: [4, 5, 6],
            color: [0, 1, 0, 1],
            age: 24,
            charge: 3
        });
    });

    it("should only destructure used view types", () => {
        // f32 only
        const vec2Layout = {
            type: "array",
            size: 8,
            fields: {
                "0": { offset: 0, type: "f32" },
                "1": { offset: 4, type: "f32" }
            }
        } as const satisfies StructLayout;
        const readVec2 = createReadStruct(vec2Layout);
        expect(readVec2.toString()).toMatch(/const { f32: __f32 } = data/);
        expect(readVec2.toString()).not.toMatch(/i32: __i32/);
        expect(readVec2.toString()).not.toMatch(/u32: __u32/);

        // i32 and u32 only
        const mixedLayout = {
            type: "object",
            size: 8,
            fields: {
                a: { offset: 0, type: "i32" },
                b: { offset: 4, type: "u32" }
            }
        } as const satisfies StructLayout;
        const readMixed = createReadStruct(mixedLayout);
        expect(readMixed.toString()).not.toMatch(/f32: __f32/);
        expect(readMixed.toString()).toMatch(/const { (?=.*i32: __i32)(?=.*u32: __u32).*? } = data/);
    });
}); 