// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createArrayBuffer } from "./create-array-buffer.js";
import { Schema } from "../schema/index.js";

describe("createArrayBuffer.copy", () => {
    it("should copy elements and capacity into a new array", () => {
        const buf = createArrayBuffer({ type: "string" }, 3);
        buf.set(0, "hello");
        buf.set(1, "world");
        buf.set(2, "test");

        const copy = buf.copy();
        expect(copy.capacity).toBe(3);
        expect(copy.get(0)).toBe("hello");
        expect(copy.get(1)).toBe("world");
        expect(copy.get(2)).toBe("test");

        // mutate original, copy should not change
        buf.set(0, "changed");
        expect(copy.get(0)).toBe("hello");
    });

    it("should perform shallow copy for object elements", () => {
        const schema = { type: "array", items: { type: "number" } } as const satisfies Schema;
        const buf = createArrayBuffer(schema, 2);
        const arr1 = [1, 2, 3];
        const arr2 = [4, 5, 6];
        buf.set(0, arr1);
        buf.set(1, arr2);

        const copy = buf.copy();
        expect(copy.get(0)).toBe(arr1); // same reference
        expect(copy.get(1)).toBe(arr2); // same reference
    });
});

describe("createArrayBuffer.isDefault", () => {
    it("should require schema.default for array buffers", () => {
        const buf = createArrayBuffer({ type: "string" }, 3);
        
        expect(() => {
            buf.isDefault(0);
        }).toThrow("Array buffer requires schema.default to check for default values");
    });

    it("should return true when value matches schema.default", () => {
        const schema = { type: "string", default: "empty" } as const satisfies Schema;
        const buf = createArrayBuffer(schema, 3);
        
        // Uninitialized values are undefined, not the default
        expect(buf.isDefault(0)).toBe(false);
        
        buf.set(0, "empty");
        buf.set(1, "not-empty");
        buf.set(2, "empty");
        
        expect(buf.isDefault(0)).toBe(true);
        expect(buf.isDefault(1)).toBe(false);
        expect(buf.isDefault(2)).toBe(true);
    });

    it("should work with number defaults", () => {
        const schema = { type: "number", default: 42 } as const satisfies Schema;
        const buf = createArrayBuffer(schema, 3);
        
        buf.set(0, 42);
        buf.set(1, 0);
        buf.set(2, 42);
        
        expect(buf.isDefault(0)).toBe(true);
        expect(buf.isDefault(1)).toBe(false);
        expect(buf.isDefault(2)).toBe(true);
    });

    it("should work with object defaults using Object.is", () => {
        const defaultObj = { x: 1, y: 2 };
        const schema = { type: "object", default: defaultObj } as const satisfies Schema;
        const buf = createArrayBuffer(schema, 3);
        
        buf.set(0, defaultObj);
        buf.set(1, { x: 1, y: 2 }); // same value, different reference
        buf.set(2, { x: 2, y: 3 }); // different value
        
        expect(buf.isDefault(0)).toBe(true); // same reference
        expect(buf.isDefault(1)).toBe(false); // different reference (Object.is)
        expect(buf.isDefault(2)).toBe(false); // different value
    });

    it("should handle undefined as default", () => {
        const schema = { type: "string", default: undefined } as const satisfies Schema;
        const buf = createArrayBuffer(schema, 2);
        
        // Uninitialized array elements are undefined
        expect(buf.isDefault(0)).toBe(true);
        expect(buf.isDefault(1)).toBe(true);
        
        buf.set(0, "value");
        expect(buf.isDefault(0)).toBe(false);
    });
});


