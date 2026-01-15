// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Schema } from "./index.js";
import type { Schema as SchemaType } from "./schema.js";

describe("Schema.toVertexBufferLayout", () => {
    describe("position-color-normal vertex schema", () => {
        const positionColorNormalSchema = {
            type: "object",
            properties: {
                position: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                },
                color: {
                    type: "array", 
                    items: { type: "number", precision: 1 },
                    minItems: 4,
                    maxItems: 4
                },
                normal: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                }
            },
            layout: "packed"
        } as const satisfies SchemaType;

        it("should generate correct packed layout for position-color-normal", () => {
            const layout = Schema.toVertexBufferLayout(positionColorNormalSchema);

            expect(layout.arrayStride).toBe(40); // 3 + 4 + 3 = 10 floats × 4 bytes = 40 bytes
            expect(layout.stepMode).toBe("vertex");
            expect(layout.attributes).toHaveLength(3);

            // Position: Vec3 at offset 0
            expect(layout.attributes[0]).toEqual({
                format: "float32x3",
                offset: 0,
                shaderLocation: 0
            });

            // Color: Vec4 at offset 12
            expect(layout.attributes[1]).toEqual({
                format: "float32x4", 
                offset: 12,
                shaderLocation: 1
            });

            // Normal: Vec3 at offset 28
            expect(layout.attributes[2]).toEqual({
                format: "float32x3",
                offset: 28,
                shaderLocation: 2
            });
        });

        it("should allow custom shader locations", () => {
            const layout = Schema.toVertexBufferLayout(positionColorNormalSchema, {
                shaderLocations: {
                    position: 0,
                    color: 8,
                    normal: 9
                }
            });

            expect(layout.attributes.find((a: any) => a.shaderLocation === 0)?.offset).toBe(0);
            expect(layout.attributes.find((a: any) => a.shaderLocation === 8)?.offset).toBe(12); 
            expect(layout.attributes.find((a: any) => a.shaderLocation === 9)?.offset).toBe(28);
        });

        it("should support instance step mode", () => {
            const layout = Schema.toVertexBufferLayout(positionColorNormalSchema, {
                stepMode: "instance"
            });

            expect(layout.stepMode).toBe("instance");
        });
    });

    describe("simple position schema", () => {
        const positionSchema: SchemaType = {
            type: "object",
            properties: {
                position: {
                    type: "array",
                    items: { type: "number", precision: 1 },
                    minItems: 3,
                    maxItems: 3
                }
            },
            layout: "packed"
        };

        it("should generate minimal vertex layout", () => {
            const layout = Schema.toVertexBufferLayout(positionSchema);

            expect(layout.arrayStride).toBe(12); // Vec3 = 12 bytes
            expect(layout.attributes).toHaveLength(1);
            expect(layout.attributes[0]).toEqual({
                format: "float32x3",
                offset: 0,
                shaderLocation: 0
            });
        });
    });

    describe("primitive type schemas", () => {
        it("should handle single float", () => {
            const schema: SchemaType = {
                type: "object",
                properties: {
                    weight: { type: "number", precision: 1 }
                },
                layout: "packed"
            };

            const layout = Schema.toVertexBufferLayout(schema);

            expect(layout.arrayStride).toBe(4);
            expect(layout.attributes[0]).toEqual({
                format: "float32",
                offset: 0,
                shaderLocation: 0
            });
        });

        it("should handle integer types", () => {
            const schema: SchemaType = {
                type: "object",
                properties: {
                    id: { type: "integer", minimum: 0, maximum: 65535 }
                },
                layout: "packed"
            };

            const layout = Schema.toVertexBufferLayout(schema);

            expect(layout.arrayStride).toBe(4);
            expect(layout.attributes[0]).toEqual({
                format: "uint32",
                offset: 0,
                shaderLocation: 0
            });
        });
    });

    describe("error handling", () => {
        it("should throw error for non-struct schemas", () => {
            const arraySchema: SchemaType = {
                type: "array",
                items: { type: "number" }
            };

            expect(() => {
                Schema.toVertexBufferLayout(arraySchema);
            }).toThrow(/Array must have fixed length/);
        });

        it("should throw error for unsupported field types", () => {
            const schema: SchemaType = {
                type: "object",
                properties: {
                    name: { type: "string" }
                },
                layout: "packed"
            };

            expect(() => {
                Schema.toVertexBufferLayout(schema);
            }).toThrow(/not a valid struct type/);
        });

        it("should throw error for oversized vectors", () => {
            const schema: SchemaType = {
                type: "object",
                properties: {
                    values: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 5,
                        maxItems: 5
                    }
                },
                layout: "packed"
            };

            expect(() => {
                Schema.toVertexBufferLayout(schema);
            }).toThrow(/dimensions must be 1-4 elements/);
        });
    });

    describe("layout mode handling", () => {
        it("should use schema layout by default", () => {
            const schema: SchemaType = {
                type: "object",
                properties: {
                    position: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 3,
                        maxItems: 3
                    }
                },
                layout: "packed"
            };

            const layout = Schema.toVertexBufferLayout(schema);
            expect(layout.arrayStride).toBe(12); // Packed: tight packing
        });

        it("should override schema layout when specified", () => {
            const schema: SchemaType = {
                type: "object",
                properties: {
                    position: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 3,
                        maxItems: 3
                    }
                },
                layout: "packed"
            };

            const layout = Schema.toVertexBufferLayout(schema, {
                layout: "std140"
            });
            expect(layout.arrayStride).toBe(16); // std140: 16-byte alignment
        });
    });

    describe("type-safe helper", () => {
        it("should work with Schema.toVertexBufferLayoutForType", () => {
            const testSchema: SchemaType = {
                type: "object",
                properties: {
                    position: {
                        type: "array",
                        items: { type: "number", precision: 1 },
                        minItems: 2,
                        maxItems: 2
                    }
                },
                layout: "packed"
            };

            const layout = Schema.toVertexBufferLayoutForType(testSchema);
            expect(layout.arrayStride).toBe(8); // Vec2 = 8 bytes
            expect(layout.attributes[0].format).toBe("float32x2");
        });
    });
});
