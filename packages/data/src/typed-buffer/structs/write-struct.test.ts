// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createWriteStruct } from "./create-write-struct.js";
import { createDataView32 } from "../../internal/data-view-32/create-data-view-32.js";
import type { StructLayout } from "./struct-layout.js";

describe("WriteStruct", () => {
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
        const write = createWriteStruct(layout);

        const data = createDataView32(new ArrayBuffer(16));
        write(data, 0, [1.5, 2.5]);
        expect(data.f32[0]).toBe(1.5);
        expect(data.f32[1]).toBe(2.5);

        // Test with offset
        write(data, 1, [3.5, 4.5]);
        expect(data.f32[2]).toBe(3.5);
        expect(data.f32[3]).toBe(4.5);
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
        const write = createWriteStruct(layout);

        const data = createDataView32(new ArrayBuffer(16));
        write(data, 0, { x: 1.5, y: 2.5 });
        expect(data.f32[0]).toBe(1.5);
        expect(data.f32[1]).toBe(2.5);

        // Test with offset
        write(data, 1, { x: 3.5, y: 4.5 });
        expect(data.f32[2]).toBe(3.5);
        expect(data.f32[3]).toBe(4.5);
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
        const write = createWriteStruct(layout);

        const data = createDataView32(new ArrayBuffer(96));  // Space for 2 structs

        // Write first struct
        write(data, 0, {
            position: [1, 2, 3],
            color: [1, 0, 0, 1],
            age: 42,
            charge: -5
        });

        // Verify first struct
        expect(data.f32[0]).toBe(1);
        expect(data.f32[1]).toBe(2);
        expect(data.f32[2]).toBe(3);
        expect(data.f32[4]).toBe(1);
        expect(data.f32[5]).toBe(0);
        expect(data.f32[6]).toBe(0);
        expect(data.f32[7]).toBe(1);
        expect(data.u32[8]).toBe(42);
        expect(data.i32[9]).toBe(-5);

        // Write second struct at offset
        write(data, 1, {
            position: [4, 5, 6],
            color: [0, 1, 0, 1],
            age: 24,
            charge: 3
        });

        // Verify second struct
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
        // f32 only
        const vec2Layout = {
            type: "array",
            size: 8,
            fields: {
                "0": { offset: 0, type: "f32" },
                "1": { offset: 4, type: "f32" }
            }
        } as const satisfies StructLayout;
        const writeVec2 = createWriteStruct(vec2Layout);
        expect(writeVec2.toString()).toMatch(/const { f32: __f32 } = data/);
        expect(writeVec2.toString()).not.toMatch(/i32: __i32/);
        expect(writeVec2.toString()).not.toMatch(/u32: __u32/);

        // i32 and u32 only
        const mixedLayout = {
            type: "object",
            size: 8,
            fields: {
                a: { offset: 0, type: "i32" },
                b: { offset: 4, type: "u32" }
            }
        } as const satisfies StructLayout;
        const writeMixed = createWriteStruct(mixedLayout);
        expect(writeMixed.toString()).not.toMatch(/f32: __f32/);
        expect(writeMixed.toString()).toMatch(/const { (?=.*i32: __i32)(?=.*u32: __u32).*? } = data/);
    });
}); 