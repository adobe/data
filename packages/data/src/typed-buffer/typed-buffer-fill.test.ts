// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "./create-typed-buffer.js";
import { createNumberBuffer } from "./create-number-buffer.js";
import { createBooleanBuffer } from "./create-boolean-buffer.js";
import { createEnumBuffer } from "./create-enum-buffer.js";
import { createArrayBuffer } from "./create-array-buffer.js";
import { createStructBuffer } from "./create-struct-buffer.js";
import { createConstBuffer } from "./create-const-buffer.js";

describe("TypedBuffer.fill", () => {
    it("fills number buffer on a clamped index range", () => {
        const buffer = createNumberBuffer({ type: "number", precision: 1 }, 8);
        buffer.fill(3.5, 1, 6);
        expect(buffer.get(0)).toBe(0);
        expect(buffer.get(1)).toBe(3.5);
        expect(buffer.get(5)).toBe(3.5);
        expect(buffer.get(6)).toBe(0);
    });

    it("fills boolean buffer on a clamped index range", () => {
        const buffer = createBooleanBuffer({ type: "boolean" }, 6);
        buffer.fill(true, 3, 6);
        expect(buffer.get(2)).toBe(false);
        expect(buffer.get(3)).toBe(true);
        expect(buffer.get(5)).toBe(true);
    });

    it("fills enum buffer with valid enum value", () => {
        const buffer = createEnumBuffer({ enum: ["a", "b", "c"], default: "a" }, 5);
        buffer.fill("b", 0, 3);
        expect(buffer.get(0)).toBe("b");
        expect(buffer.get(2)).toBe("b");
        expect(buffer.get(3)).toBe("a");
    });

    it("fills array-backed typed buffer", () => {
        const buffer = createArrayBuffer({ type: "string", default: "z" }, 4);
        buffer.fill("hello", 1, 3);
        expect(buffer.get(1)).toBe("hello");
        expect(buffer.get(2)).toBe("hello");
    });

    it("fills struct buffer in a range", () => {
        const schema = {
            type: "object",
            properties: {
                x: { type: "number", precision: 1 },
                y: { type: "number", precision: 1 },
            },
        } as const;
        const buffer = createStructBuffer(schema, 5);
        buffer.fill({ x: 9, y: 8 }, 1, 4);
        expect(buffer.get(0)).toEqual({ x: 0, y: 0 });
        expect(buffer.get(1)).toEqual({ x: 9, y: 8 });
        expect(buffer.get(3)).toEqual({ x: 9, y: 8 });
        expect(buffer.get(4)).toEqual({ x: 0, y: 0 });
    });

    it("fills zero structs with a single byte-range clear", () => {
        const schema = {
            type: "object",
            properties: {
                x: { type: "number", precision: 1 },
                y: { type: "number", precision: 1 },
            },
        } as const;
        const buffer = createStructBuffer(schema, 8);
        buffer.set(0, { x: 4, y: 5 });
        buffer.fill({ x: 0, y: 0 }, 0, 8);
        for (let i = 0; i < 8; i++) {
            expect(buffer.get(i)).toEqual({ x: 0, y: 0 });
            expect(buffer.isDefault(i)).toBe(true);
        }
    });

    it("createTypedBuffer routes fill on boolean schema", () => {
        const buffer = createTypedBuffer({ type: "boolean" }, 5);
        buffer.fill(true);
        for (let i = 0; i < 5; i++) {
            expect(buffer.get(i)).toBe(true);
        }
    });

    it("const buffer fill is a no-op", () => {
        const buffer = createConstBuffer({ const: 42 }, 3);
        buffer.fill(99 as unknown as number, 0, 3);
        expect(buffer.get(0)).toBe(42);
        expect(buffer.get(2)).toBe(42);
    });
});
