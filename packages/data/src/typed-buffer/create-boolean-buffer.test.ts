// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Boolean } from "../schema/boolean/index.js";
import { createTypedBuffer } from "./create-typed-buffer.js";
import {
    booleanStorageByteLength,
    booleanWordCount,
    createBooleanBuffer,
} from "./create-boolean-buffer.js";
import { TypedBuffer } from "./typed-buffer.js";
import { equals } from "../equals.js";
import { serialize, deserialize } from "../functions/serialization/serialize.js";

describe("createBooleanBuffer", () => {
    it("should be chosen automatically for boolean schemas", () => {
        const buffer = createTypedBuffer(Boolean.schema, 64);
        expect(buffer.type).toBe("boolean");
    });

    it("should still use const buffer for boolean const schemas", () => {
        const buffer = createTypedBuffer({ type: "boolean", const: true, default: true }, 4);
        expect(buffer.type).toBe("const");
    });

    it("should allocate one u32 word per 32 booleans", () => {
        expect(booleanWordCount(1)).toBe(1);
        expect(booleanWordCount(32)).toBe(1);
        expect(booleanWordCount(33)).toBe(2);
        expect(booleanStorageByteLength(33)).toBe(8);
    });

    it("should default all bits to false", () => {
        const buffer = createBooleanBuffer(Boolean.schema, 40);
        for (let i = 0; i < 40; i++) {
            expect(buffer.get(i)).toBe(false);
            expect(buffer.isDefault(i)).toBe(true);
        }
    });

    it("should get and set individual bits", () => {
        const buffer = createBooleanBuffer(Boolean.schema, 100);
        buffer.set(0, true);
        buffer.set(31, true);
        buffer.set(32, true);
        buffer.set(63, true);
        buffer.set(99, true);

        expect(buffer.get(0)).toBe(true);
        expect(buffer.get(31)).toBe(true);
        expect(buffer.get(32)).toBe(true);
        expect(buffer.get(63)).toBe(true);
        expect(buffer.get(99)).toBe(true);
        expect(buffer.get(1)).toBe(false);
        expect(buffer.get(33)).toBe(false);
        expect(buffer.isDefault(1)).toBe(true);
        expect(buffer.isDefault(0)).toBe(false);
    });

    it("should clear bits when set to false", () => {
        const buffer = createBooleanBuffer(Boolean.schema, 8);
        buffer.set(3, true);
        expect(buffer.get(3)).toBe(true);
        buffer.set(3, false);
        expect(buffer.get(3)).toBe(false);
    });

    it("should initialize from boolean arrays via createTypedBuffer", () => {
        const buffer = createTypedBuffer(Boolean.schema, [true, false, true, true]);
        expect(buffer.type).toBe("boolean");
        expect(buffer.capacity).toBe(4);
        expect(buffer.get(0)).toBe(true);
        expect(buffer.get(1)).toBe(false);
        expect(buffer.get(2)).toBe(true);
        expect(buffer.get(3)).toBe(true);
    });

    it("should expose packed storage as Uint32Array", () => {
        const buffer = createBooleanBuffer(Boolean.schema, 32);
        buffer.set(0, true);
        buffer.set(31, true);
        const words = buffer.getTypedArray() as Uint32Array;
        expect(words.length).toBe(1);
        expect(words[0]).toBe(0x80000001);
    });

    describe("copyWithin", () => {
        it("should copy boolean ranges", () => {
            const buffer = createBooleanBuffer(Boolean.schema, 8);
            buffer.set(0, true);
            buffer.set(1, true);
            buffer.set(2, false);
            buffer.copyWithin(2, 0, 2);
            expect(buffer.get(2)).toBe(true);
            expect(buffer.get(3)).toBe(true);
        });

        it("should copy overlapping ranges backward", () => {
            const buffer = createBooleanBuffer(Boolean.schema, 4);
            buffer.set(0, true);
            buffer.set(1, false);
            buffer.copyWithin(1, 0, 2);
            expect(buffer.get(1)).toBe(true);
            expect(buffer.get(2)).toBe(false);
        });
    });

    it("should resize capacity and preserve existing bits", () => {
        const buffer = createBooleanBuffer(Boolean.schema, 10);
        buffer.set(0, true);
        buffer.set(9, true);
        buffer.capacity = 40;
        expect(buffer.get(0)).toBe(true);
        expect(buffer.get(9)).toBe(true);
        expect(buffer.getTypedArray().length).toBe(booleanWordCount(40));
    });

    it("should copy to an independent buffer", () => {
        const a = createBooleanBuffer(Boolean.schema, 5);
        a.set(2, true);
        const b = a.copy();
        expect(TypedBuffer.equals(a, b)).toBe(true);
        a.set(2, false);
        expect(b.get(2)).toBe(true);
    });

    it("should slice boolean values", () => {
        const buffer = createTypedBuffer(Boolean.schema, [true, false, true]);
        expect(Array.from(buffer.slice(1, 3))).toEqual([false, true]);
    });

    it("should round-trip through serialization", () => {
        const original = createTypedBuffer(Boolean.schema, 65);
        original.set(0, true);
        original.set(31, true);
        original.set(32, true);
        original.set(64, true);

        const payload = serialize({ buf: original });
        const roundTrip = deserialize<{ buf: TypedBuffer<boolean> }>(payload);

        expect(roundTrip.buf.type).toBe("boolean");
        expect(roundTrip.buf.capacity).toBe(65);
        expect(equals(roundTrip.buf, original)).toBe(true);
    });

    it("should deserialize legacy array-serialized boolean buffers", () => {
        const legacyPayload = {
            json: JSON.stringify({
                buf: {
                    codec: "typed-buffer",
                    json: {
                        type: "array",
                        schema: Boolean.schema,
                        capacity: 4,
                        array: [true, false, true, true],
                    },
                    binaryIndex: 0,
                    binaryCount: 0,
                },
            }),
            binary: [],
        };

        const roundTrip = deserialize<{ buf: TypedBuffer<boolean> }>(legacyPayload);
        expect(roundTrip.buf.type).toBe("boolean");
        expect(roundTrip.buf.get(0)).toBe(true);
        expect(roundTrip.buf.get(1)).toBe(false);
        expect(roundTrip.buf.get(2)).toBe(true);
        expect(roundTrip.buf.get(3)).toBe(true);
    });

    it("should reset ephemeral boolean buffers on deserialize", () => {
        const ephemeral = createTypedBuffer({ ...Boolean.schema, ephemeral: true }, 10);
        ephemeral.set(0, true);
        ephemeral.set(9, true);

        const payload = serialize({ ephemeral });
        const roundTrip = deserialize<{ ephemeral: TypedBuffer<boolean> }>(payload);

        expect(roundTrip.ephemeral.capacity).toBe(10);
        expect(roundTrip.ephemeral.get(0)).toBe(false);
        expect(roundTrip.ephemeral.get(9)).toBe(false);
    });
});
