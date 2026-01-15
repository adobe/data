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


