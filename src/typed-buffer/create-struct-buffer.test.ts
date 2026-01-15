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

    describe("std140 layout (default)", () => {
        it("should create buffer with std140 layout by default", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                }
            };

            const buffer = createStructBuffer(schema, 1);
            
            // Should use std140 layout (32 bytes: 16 + 16)
            expect(buffer.capacity).toBe(1);
            expect(buffer.type).toBe("struct");
            expect(buffer.typedArrayElementSizeInBytes).toBe(32); // vec3 padded to vec4 + vec4
        });

        it("should explicitly accept std140 layout parameter", () => {
            const schema: Schema = {
                type: "object", 
                properties: {
                    position: Vec3Schema,
                    scale: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 1);
            
            // vec3 (16 bytes padded) + f32 (4 bytes) = 20 bytes, rounded to vec4 = 20 bytes
            expect(buffer.typedArrayElementSizeInBytes).toBeGreaterThanOrEqual(16);
        });
        
        it("should work with arrayBuffer parameter", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const arrayBuffer = new ArrayBuffer(32); // 2 * 16 bytes for std140
            const buffer = createStructBuffer(schema, arrayBuffer);
            
            expect(buffer.capacity).toBe(2); // 32 bytes / 16 bytes per element
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
            const std140Schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes
                    normal: Vec3Schema      // 12 bytes
                },
                layout: "std140"
            };
            const packedSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes
                    normal: Vec3Schema      // 12 bytes
                },
                layout: "packed"
            };

            const std140Buffer = createStructBuffer(std140Schema, 100);
            const packedBuffer = createStructBuffer(packedSchema, 100);

            // std140: 2 * 16 bytes = 32 bytes per element
            // packed: 12 + 12 = 24 bytes per element
            expect(packedBuffer.typedArrayElementSizeInBytes).toBeLessThan(std140Buffer.typedArrayElementSizeInBytes);
            expect(packedBuffer.typedArrayElementSizeInBytes).toBe(24);
            expect(std140Buffer.typedArrayElementSizeInBytes).toBe(32);
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
            const layouts: Layout[] = ["std140", "packed"];
            
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

    describe("backwards compatibility", () => {
        it("should default to std140 layout when no layout specified", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 1);
            
            // Should default to std140 (padded to vec4 = 16 bytes)
            expect(buffer.typedArrayElementSizeInBytes).toBe(16);
        });

        it("should work with existing function signatures", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    value: F32.schema
                }
            };

            // Test both function signature forms
            const buffer1 = createStructBuffer(schema, 5);
            const buffer2 = createStructBuffer(schema, new ArrayBuffer(80)); // 5 * 16 bytes
            
            expect(buffer1.capacity).toBe(5);
            expect(buffer2.capacity).toBe(5);
        });
    });

    describe("vertex buffer use case", () => {
        it("should be optimized for vertex data with packed layout", () => {
            // Typical vertex format: position + color
            const std140VertexSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes for tight vertex packing
                    color: Vec4Schema        // 16 bytes
                },
                layout: "std140"
            };
            const packedVertexSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,    // 12 bytes for tight vertex packing
                    color: Vec4Schema        // 16 bytes
                },
                layout: "packed"
            };

            const std140VertexBuffer = createStructBuffer(std140VertexSchema, 1000);
            const packedVertexBuffer = createStructBuffer(packedVertexSchema, 1000);

            // Calculate memory usage
            const std140Memory = std140VertexBuffer.capacity * std140VertexBuffer.typedArrayElementSizeInBytes;
            const packedMemory = packedVertexBuffer.capacity * packedVertexBuffer.typedArrayElementSizeInBytes;
            
            // Packed should use less memory
            expect(packedMemory).toBeLessThan(std140Memory);
            
            // Verify the difference is sensible (12.5% reduction for vec3 + vec4)
            const memorySavings = (std140Memory - packedMemory) / std140Memory;
            expect(memorySavings).toBeCloseTo(0.125, 2); // 12.5% savings
        });
    });
});