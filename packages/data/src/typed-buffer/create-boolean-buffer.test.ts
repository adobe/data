// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createBooleanBuffer, booleanBufferType } from "./create-boolean-buffer.js";
import { createTypedBuffer } from "./create-typed-buffer.js";

describe("createBooleanBuffer", () => {
    it("stores values in a Uint8Array", () => {
        const buffer = createBooleanBuffer({ type: "boolean" }, 4);
        expect(buffer.type).toBe(booleanBufferType);
        expect(buffer.getTypedArray()).toBeInstanceOf(Uint8Array);
        buffer.set(0, true);
        buffer.set(1, false);
        expect(buffer.get(0)).toBe(true);
        expect(buffer.get(1)).toBe(false);
        expect(buffer.getTypedArray()[0]).toBe(1);
        expect(buffer.getTypedArray()[1]).toBe(0);
    });

    it("respects schema.default for initial fill", () => {
        const buffer = createBooleanBuffer({ type: "boolean", default: true }, 3);
        expect(buffer.get(0)).toBe(true);
        expect(buffer.get(1)).toBe(true);
        expect(buffer.isDefault(0)).toBe(true);
        buffer.set(0, false);
        expect(buffer.isDefault(0)).toBe(false);
    });

    it("createTypedBuffer routes boolean schemas to Uint8-backed buffer", () => {
        const buffer = createTypedBuffer({ type: "boolean" }, 2);
        expect(buffer.type).toBe(booleanBufferType);
        expect(buffer.getTypedArray()).toBeInstanceOf(Uint8Array);
    });
});
