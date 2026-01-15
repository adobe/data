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


