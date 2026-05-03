// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createStructBuffer } from "./create-struct-buffer.js";
import { F32 } from "../math/f32/index.js";
import type { Schema, Layout } from "../schema/index.js";

describe("createStructBuffer", () => {
    const Vec3Schema: Schema = {
        type: "array",
        items: { type: "number", precision: 1 },
        minItems: 3,
        maxItems: 3
    };

    const Vec4Schema: Schema = {
        type: "array",
        items: { type: "number", precision: 1 },
        minItems: 4,
        maxItems: 4
    };

    describe("storage layout (default)", () => {
        it("uses WGSL storage rules by default", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                }
            };

            const buffer = createStructBuffer(schema, 1);

            // vec3 at 0..12, vec4 at 16..32, struct align 16 -> size 32
            expect(buffer.capacity).toBe(1);
            expect(buffer.type).toBe("struct");
            expect(buffer.typedArrayElementSizeInBytes).toBe(32);
        });

        it("packs vec3 + f32 to 16 bytes", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    scale: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 1);
            // vec3 at 0..12, f32 at 12..16, struct align 16 -> size 16
            expect(buffer.typedArrayElementSizeInBytes).toBe(16);
        });

        it("works with arrayBuffer parameter", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            // scalar-only struct: align 4, size 8
            const arrayBuffer = new ArrayBuffer(32);
            const buffer = createStructBuffer(schema, arrayBuffer);

            expect(buffer.capacity).toBe(4);
        });
    });

    describe("packed layout", () => {
        it("creates buffer with packed layout", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                },
                layout: "packed"
            };

            const buffer = createStructBuffer(schema, 1);

            expect(buffer.type).toBe("struct");
            expect(buffer.typedArrayElementSizeInBytes).toBe(28);
            expect(buffer.capacity).toBe(1);
        });

        it("shows memory efficiency difference vs storage", () => {
            const storageSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    normal: Vec3Schema
                },
                layout: "storage"
            };
            const packedSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    normal: Vec3Schema
                },
                layout: "packed"
            };

            const storageBuffer = createStructBuffer(storageSchema, 100);
            const packedBuffer = createStructBuffer(packedSchema, 100);

            // storage: vec3 at 0..12, vec3 at 16..28, struct align 16 -> size 32
            // packed:  vec3 + vec3 = 24 bytes
            expect(packedBuffer.typedArrayElementSizeInBytes).toBeLessThan(storageBuffer.typedArrayElementSizeInBytes);
            expect(packedBuffer.typedArrayElementSizeInBytes).toBe(24);
            expect(storageBuffer.typedArrayElementSizeInBytes).toBe(32);
        });

        it("works with primitive fields in packed layout", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    id: { type: "integer", minimum: 0, maximum: 65535 },
                    weight: F32.schema
                },
                layout: "packed"
            };

            const buffer = createStructBuffer(schema, 2);

            expect(buffer.typedArrayElementSizeInBytes).toBe(8);
            expect(buffer.capacity).toBe(2);
        });

        it("works with arrayBuffer parameter for packed layout", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    scale: F32.schema
                },
                layout: "packed"
            };

            // packed: vec3 + f32 = 16 bytes per element
            const arrayBuffer = new ArrayBuffer(96);
            const buffer = createStructBuffer(schema, arrayBuffer);

            expect(buffer.capacity).toBe(6);
        });
    });

    describe("type safety", () => {
        it("accepts the Layout union", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    value: F32.schema
                }
            };

            const layouts: Layout[] = ["storage", "packed"];

            layouts.forEach(layout => {
                const schemaWithLayout = { ...schema, layout };
                const buffer = createStructBuffer(schemaWithLayout, 1);
                expect(buffer.type).toBe("struct");
            });
        });
    });

    describe("default behavior", () => {
        it("defaults to storage layout when no layout specified", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    a: F32.schema,
                    b: F32.schema
                }
            };

            const buffer = createStructBuffer(schema, 1);

            // scalar-only struct: size 8 (align 4, no vec4 rounding)
            expect(buffer.typedArrayElementSizeInBytes).toBe(8);
        });

        it("works with existing function signatures", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    value: F32.schema
                }
            };

            // scalar-only single-field struct: size 4
            const buffer1 = createStructBuffer(schema, 5);
            const buffer2 = createStructBuffer(schema, new ArrayBuffer(20));

            expect(buffer1.capacity).toBe(5);
            expect(buffer2.capacity).toBe(5);
        });
    });

    describe("vertex buffer use case", () => {
        it("uses less memory with packed than storage", () => {
            const storageVertexSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                },
                layout: "storage"
            };
            const packedVertexSchema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                },
                layout: "packed"
            };

            const storageVertexBuffer = createStructBuffer(storageVertexSchema, 1000);
            const packedVertexBuffer = createStructBuffer(packedVertexSchema, 1000);

            const storageMemory = storageVertexBuffer.capacity * storageVertexBuffer.typedArrayElementSizeInBytes;
            const packedMemory = packedVertexBuffer.capacity * packedVertexBuffer.typedArrayElementSizeInBytes;

            expect(packedMemory).toBeLessThan(storageMemory);

            const memorySavings = (storageMemory - packedMemory) / storageMemory;
            expect(memorySavings).toBeCloseTo(0.125, 2);
        });
    });

    describe("isDefault", () => {
        it("returns true for zero-initialized structs", () => {
            const schema: Schema = {
                type: "object",
                properties: {
                    position: Vec3Schema,
                    color: Vec4Schema
                }
            };

            const buffer = createStructBuffer(schema, 2);
            expect(buffer.isDefault(0)).toBe(true);
            expect(buffer.isDefault(1)).toBe(true);
        });

        it("returns false for non-zero structs", () => {
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
            expect(buffer.isDefault(1)).toBe(true);
        });

        it("checks all struct fields are zero", () => {
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

            expect(buffer.isDefault(0)).toBe(true);
            expect(buffer.isDefault(1)).toBe(false);
            expect(buffer.isDefault(2)).toBe(false);
        });

        it("works with packed layout", () => {
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
