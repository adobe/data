// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createNumberBuffer } from "./create-number-buffer.js";
import { F32 } from "../math/f32/index.js";

describe("createNumberBuffer.copy", () => {
    it("should copy contents and capacity into a new underlying buffer", () => {
        const buf = createNumberBuffer(F32.schema, 4);
        buf.set(0, 1);
        buf.set(1, 2);
        buf.set(2, 3);
        buf.set(3, 4);

        const copy = buf.copy();

        expect(copy.capacity).toBe(4);
        expect(copy.get(0)).toBe(1);
        expect(copy.get(1)).toBe(2);
        expect(copy.get(2)).toBe(3);
        expect(copy.get(3)).toBe(4);

        const srcTA = buf.getTypedArray();
        const dstTA = copy.getTypedArray();
        expect(dstTA).not.toBe(srcTA);
        // buffers should be different
        expect(dstTA.buffer).not.toBe(srcTA.buffer);

        // mutate original, copy should not change
        buf.set(0, 42);
        expect(copy.get(0)).toBe(1);
    });
});

describe("createNumberBuffer.isDefault", () => {
    it("should return true for zero values (default for TypedArrays)", () => {
        const buf = createNumberBuffer(F32.schema, 4);
        // New buffer should be initialized to zeros
        expect(buf.isDefault(0)).toBe(true);
        expect(buf.isDefault(1)).toBe(true);
        expect(buf.isDefault(2)).toBe(true);
        expect(buf.isDefault(3)).toBe(true);
    });

    it("should return false for non-zero values", () => {
        const buf = createNumberBuffer(F32.schema, 4);
        buf.set(0, 1);
        buf.set(1, 0.5);
        buf.set(2, -1);
        buf.set(3, 0); // explicitly set to 0

        expect(buf.isDefault(0)).toBe(false);
        expect(buf.isDefault(1)).toBe(false);
        expect(buf.isDefault(2)).toBe(false);
        expect(buf.isDefault(3)).toBe(true); // still 0
    });

    it("should work with schema.default override", () => {
        const schema = { ...F32.schema, default: 42 };
        const buf = createNumberBuffer(schema, 3);
        // Even with schema.default, TypedArray default is still 0
        expect(buf.isDefault(0)).toBe(true);
        
        buf.set(0, 42);
        // Now it matches schema.default, but TypedArray check is still 0
        expect(buf.isDefault(0)).toBe(false);
        
        buf.set(0, 0);
        expect(buf.isDefault(0)).toBe(true);
    });

    it("should handle negative zero correctly", () => {
        const buf = createNumberBuffer(F32.schema, 2);
        buf.set(0, -0);
        // -0 === 0 in JavaScript, so should be true
        expect(buf.isDefault(0)).toBe(true);
    });
});


