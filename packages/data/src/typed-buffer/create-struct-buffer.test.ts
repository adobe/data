// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createStructBuffer } from "./create-struct-buffer.js";
import { F32 } from "../math/f32/index.js";
import type { Schema, Layout } from "../schema/index.js";

describe("createStructBuffer", () => {
    // Helper function to create vec3 schema
    const Vec3Schema: Schema = {
        type: "array",
        items: { type: "number", precision: 1 },
        minItems: 3,
        maxItems: 3
    };

    // Helper function to create vec4 schema  
    const Vec4Schema: Schema = {
        type: "array",
        items: { type: "number", precision: 1 },
        minItems: 4,
        maxItems: 4
    };

    describe("wgsl layout (default)", () => {
        it("should create buffer with wgsl layout by default", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                }
            };

            const buffer = createStructBuffer(schema, 1);

            expect(buffer.capacity).toBe(1);
            expect(buffer.type).toBe("struct");
            expect(buffer.typedArrayElementSizeInBytes).toBe(32); // vec3 @16 + vec4
        });

        it("should pack vec3 + f32 to 16 bytes under wgsl", () => {
            const schema: Schema = {
                type: "object", 
                properties: {
                    position: Vec3Schema,
                    scale: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 1);

            expect(buffer.typedArrayElementSizeInBytes).toBe(16);
        });

        it("should work with arrayBuffer parameter", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const arrayBuffer = new ArrayBuffer(32); // 4 * 8 bytes per struct
            const buffer = createStructBuffer(schema, arrayBuffer);

            expect(buffer.capacity).toBe(4);
        });
    });

    describe("packed layout", () => {
        it("should create buffer with packed layout", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes
                    color: Vec4Schema        // 16 bytes
                },
                layout: "packed"
            };

            const buffer = createStructBuffer(schema, 1);
            
            // Packed layout: 12 + 16 = 28 bytes
            expect(buffer.type).toBe("struct");
            expect(buffer.typedArrayElementSizeInBytes).toBe(28);
            expect(buffer.capacity).toBe(1);
        });

        it("should show memory efficiency difference", () => {
            const wgslSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes
                    normal: Vec3Schema      // 12 bytes
                },
                layout: "wgsl"
            };
            const packedSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes
                    normal: Vec3Schema      // 12 bytes
                },
                layout: "packed"
            };

            const wgslBuffer = createStructBuffer(wgslSchema, 100);
            const packedBuffer = createStructBuffer(packedSchema, 100);

            expect(packedBuffer.typedArrayElementSizeInBytes).toBeLessThan(wgslBuffer.typedArrayElementSizeInBytes);
            expect(packedBuffer.typedArrayElementSizeInBytes).toBe(24);
            expect(wgslBuffer.typedArrayElementSizeInBytes).toBe(32);
        });

        it("should work with primitive fields in packed layout", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    id: { type: "integer", minimum: 0, maximum: 65535 }, // u32: 4 bytes
                    weight: F32.schema
                },
                layout: "packed"
            };

            const buffer = createStructBuffer(schema, 2);
            
            // Packed: 4 + 4 = 8 bytes per element
            expect(buffer.typedArrayElementSizeInBytes).toBe(8);
            expect(buffer.capacity).toBe(2);
        });

        it("should work with arrayBuffer parameter for packed layout", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes
                    scale: F32.schema        // 4 bytes
                },
                layout: "packed"
            };

            const arrayBuffer = new ArrayBuffer(96); // 6 * 16 bytes
            const buffer = createStructBuffer(schema, arrayBuffer);
            
            // Packed size: 16 bytes per element, so capacity should be 6
            expect(buffer.capacity).toBe(6);
        });
    });

    describe("type safety", () => {
        it("should accept Layout type for enhanced type safety", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    value: F32.schema
                }
            };

            // Demonstrate Layout type usage
            const layouts: Layout[] = ["wgsl", "packed"];
            
            layouts.forEach(layout => {
                const schemaWithLayout = { ...schema, layout };
                const buffer = createStructBuffer(schemaWithLayout, 1);
                expect(buffer.type).toBe("struct");
            });

            // Type safety: This would cause a TypeScript error:
            // const invalidLayout = "invalid" as Layout; // Expected error
            // const buffer = createStructBuffer(schema, 1, invalidLayout);
        });
    });

    describe("default layout", () => {
        it("should default to wgsl layout when no layout specified", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 1);

            expect(buffer.typedArrayElementSizeInBytes).toBe(8);
        });

        it("should work with existing function signatures", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    value: F32.schema
                }
            };

            const buffer1 = createStructBuffer(schema, 5);
            const buffer2 = createStructBuffer(schema, new ArrayBuffer(20)); // 5 * 4 bytes (single f32)

            expect(buffer1.capacity).toBe(5);
            expect(buffer2.capacity).toBe(5);
        });
    });

    describe("vertex buffer use case", () => {
        it("should be optimized for vertex data with packed layout", () => {
            // Typical vertex format: position + color
            const wgslVertexSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes for tight vertex packing
                    color: Vec4Schema        // 16 bytes
                },
                layout: "wgsl"
            };
            const packedVertexSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes for tight vertex packing
                    color: Vec4Schema        // 16 bytes
                },
                layout: "packed"
            };

            const wgslVertexBuffer = createStructBuffer(wgslVertexSchema, 1000);
            const packedVertexBuffer = createStructBuffer(packedVertexSchema, 1000);

            const wgslMemory = wgslVertexBuffer.capacity * wgslVertexBuffer.typedArrayElementSizeInBytes;
            const packedMemory = packedVertexBuffer.capacity * packedVertexBuffer.typedArrayElementSizeInBytes;

            expect(packedMemory).toBeLessThan(wgslMemory);

            const memorySavings = (wgslMemory - packedMemory) / wgslMemory;
            expect(memorySavings).toBeCloseTo(0.125, 2);
        });
    });

    describe("isDefault", () => {
        it("should return true for zero-initialized structs", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                }
            };

            const buffer = createStructBuffer(schema, 2);
            // New buffer should be initialized to zeros
            expect(buffer.isDefault(0)).toBe(true);
            expect(buffer.isDefault(1)).toBe(true);
        });

        it("should return false for non-zero structs", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    scale: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 2);
            buffer.set(0, { position: [1, 2, 3], scale: 1.5 });
            
            expect(buffer.isDefault(0)).toBe(false);
            expect(buffer.isDefault(1)).toBe(true); // still zero
        });

        it("should check all struct fields are zero", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 3);
            buffer.set(0, { a: 0, b: 0 });
            buffer.set(1, { a: 1, b: 0 });
            buffer.set(2, { a: 0, b: 1 });

            expect(buffer.isDefault(0)).toBe(true); // both zero
            expect(buffer.isDefault(1)).toBe(false); // a is non-zero
            expect(buffer.isDefault(2)).toBe(false); // b is non-zero
        });

        it("should work with packed layout", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    scale: F32.schema
                },
                layout: "packed"
            };

            const buffer = createStructBuffer(schema, 2);
            expect(buffer.isDefault(0)).toBe(true);
            
            buffer.set(0, { position: [0, 0, 0], scale: 0 });
            expect(buffer.isDefault(0)).toBe(true);
            
            buffer.set(0, { position: [1, 0, 0], scale: 0 });
            expect(buffer.isDefault(0)).toBe(false);
        });
    });
});