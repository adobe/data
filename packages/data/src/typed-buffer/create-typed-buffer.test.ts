// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "./create-typed-buffer.js";
import type { Schema } from "../schema/index.js";

describe("createTypedBuffer", () => {
    describe("layout property runtime validation", () => {
        it("should enforce struct layout when layout property is present", () => {
            // Valid struct schema with layout
            const validStructSchema: Schema = {
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
                    }
                },
                layout: "packed"
            };

            // Should work fine - this is a valid struct with layout
            const buffer = createTypedBuffer(validStructSchema, 10);
            expect(buffer.type).toBe("struct");
            expect(buffer.capacity).toBe(10);
        });

        it("should throw error for invalid schemas with layout property", () => {
            // Invalid schema: has layout but not a proper struct
            const invalidSchema: Schema = {
                type: "array",  // Wrong type for layout property
                items: { type: "number" },
                layout: "packed"  // This should cause error
            };

            // Should throw error because we're enforcing struct validation
            expect(() => {
                createTypedBuffer(invalidSchema, 10);
            }).toThrow(/Array must have fixed length/);
        });

        it("should throw specific error for invalid array schemas with layout", () => {
            // Array without single item type
            const invalidArraySchema1: Schema = {
                type: "array",
                layout: "packed"
            };

            expect(() => {
                createTypedBuffer(invalidArraySchema1, 10);
            }).toThrow(/Array schema must have single item type/);

            // Array without fixed length
            const invalidArraySchema2: Schema = {
                type: "array",
                items: { type: "number" },
                layout: "packed"
            };

            expect(() => {
                createTypedBuffer(invalidArraySchema2, 10);
            }).toThrow(/Array must have fixed length/);
        });

        it("should throw specific error for invalid object schemas with layout", () => {
            // Object without properties
            const invalidObjectSchema: Schema = {
                type: "object",
                layout: "packed"
            };

            expect(() => {
                createTypedBuffer(invalidObjectSchema, 10);
            }).toThrow(/Schema must be an object type with properties definition/);

            // Object with invalid field
            const invalidFieldSchema: Schema = {
                type: "object",
                properties: {
                    invalidField: { type: "string" }  // Not a valid struct type
                },
                layout: "packed"
            };

            expect(() => {
                createTypedBuffer(invalidFieldSchema, 10);
            }).toThrow(/Field "invalidField" is not a valid struct type/);
        });

        it("should work normally for schemas without layout property", () => {
            // Schema without layout should fall back to normal logic
            const arraySchema: Schema = {
                type: "array",
                items: { type: "number" }
            };

            const buffer = createTypedBuffer(arraySchema, 10);
            expect(buffer.type).toBe("array");
            expect(buffer.capacity).toBe(10);
        });

        it("should handle number schemas with layout property", () => {
            // Number schema with layout should still validate properly
            const numberSchema: Schema = {
                type: "number",
                layout: "packed"  // This shouldn't interfere with number creation
            };

            // Number schemas are handled before struct validation
            const buffer = createTypedBuffer(numberSchema, 10);
            expect(buffer.type).toBe("number");
            expect(buffer.capacity).toBe(10);
        });
    });

    describe("basic functionality", () => {
        it("should create typed buffer from capacity", () => {
            const schema: Schema = {
                type: "array",
                items: { type: "number" }
            };

            const buffer = createTypedBuffer(schema, 20);
            expect(buffer.capacity).toBe(20);
        });

        it("should create typed buffer from initial values", () => {
            const schema: Schema = {
                type: "array",
                items: { type: "number" }
            };

            const initialValues = [[1], [2], [3]] as any[];
            const buffer = createTypedBuffer(schema, initialValues);
            expect(buffer.capacity).toBe(3);
            expect(buffer.get(0)).toEqual([1]);
            expect(buffer.get(1)).toEqual([2]);
            expect(buffer.get(2)).toEqual([3]);
        });
    });
});
