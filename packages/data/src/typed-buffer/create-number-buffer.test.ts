// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createNumberBuffer } from "./create-number-buffer.js";
import { F32 } from "../math/f32/index.js";
import { U8 } from "../math/u8/index.js";
import { U16 } from "../math/u16/index.js";
import { U32 } from "../math/u32/index.js";
import { I8 } from "../math/i8/index.js";
import { I16 } from "../math/i16/index.js";
import { I32 } from "../math/i32/index.js";

describe("createNumberBuffer typed array selection", () => {
    it("uses Uint8Array for U8 schema", () => {
        const buf = createNumberBuffer(U8.schema, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Uint8Array);
        expect(buf.typedArrayElementSizeInBytes).toBe(1);
    });

    it("uses Uint16Array for U16 schema", () => {
        const buf = createNumberBuffer(U16.schema, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Uint16Array);
        expect(buf.typedArrayElementSizeInBytes).toBe(2);
    });

    it("uses Uint32Array for U32 schema", () => {
        const buf = createNumberBuffer(U32.schema, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Uint32Array);
        expect(buf.typedArrayElementSizeInBytes).toBe(4);
    });

    it("uses Int8Array for I8 schema", () => {
        const buf = createNumberBuffer(I8.schema, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Int8Array);
        expect(buf.typedArrayElementSizeInBytes).toBe(1);
    });

    it("uses Int16Array for I16 schema", () => {
        const buf = createNumberBuffer(I16.schema, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Int16Array);
        expect(buf.typedArrayElementSizeInBytes).toBe(2);
    });

    it("uses Int32Array for I32 schema", () => {
        const buf = createNumberBuffer(I32.schema, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Int32Array);
        expect(buf.typedArrayElementSizeInBytes).toBe(4);
    });

    it("uses Uint8Array for a sub-byte range like [0, 10]", () => {
        const buf = createNumberBuffer({ type: "integer", minimum: 0, maximum: 10, default: 0 }, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Uint8Array);
    });

    it("uses Uint16Array for [0, 1000] (fits in u16, not u8)", () => {
        const buf = createNumberBuffer({ type: "integer", minimum: 0, maximum: 1000, default: 0 }, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Uint16Array);
    });

    it("falls back to Float64Array for integer with no min/max", () => {
        const buf = createNumberBuffer({ type: "integer", default: 0 }, 4);
        expect(buf.getTypedArray()).toBeInstanceOf(Float64Array);
    });

    it("rounds trip values correctly through Uint8Array", () => {
        const buf = createNumberBuffer(U8.schema, 4);
        buf.set(0, 0);
        buf.set(1, 128);
        buf.set(2, 255);
        expect(buf.get(0)).toBe(0);
        expect(buf.get(1)).toBe(128);
        expect(buf.get(2)).toBe(255);
    });

    it("rounds trip values correctly through Int8Array", () => {
        const buf = createNumberBuffer(I8.schema, 4);
        buf.set(0, -128);
        buf.set(1, 0);
        buf.set(2, 127);
        expect(buf.get(0)).toBe(-128);
        expect(buf.get(1)).toBe(0);
        expect(buf.get(2)).toBe(127);
    });
});

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


