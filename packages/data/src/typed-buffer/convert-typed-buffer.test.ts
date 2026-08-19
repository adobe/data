// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { createTypedBuffer } from "./create-typed-buffer.js";
import { convertTypedBuffer } from "./convert-typed-buffer.js";
import type { Schema } from "../schema/schema.js";

const num = { type: "number" } as const satisfies Schema;
const f32 = { type: "number", precision: 1 } as const satisfies Schema;

describe("convertTypedBuffer — numeric buffers", () => {
    it("F64 → F32 copies with precision loss", () => {
        const src = createTypedBuffer(num, 2);
        src.set(0, 0.1);
        src.set(1, 1.5);
        const out = convertTypedBuffer(src, f32);
        // 1.5 is exact in f32; 0.1 rounds to the nearest f32.
        expect(out.get(1)).toBe(1.5);
        expect(out.get(0)).toBe(new Float32Array([0.1])[0]);
        expect(out.get(0)).not.toBe(0.1);
    });

    it("caps values into a narrow integer range on convert", () => {
        const src = createTypedBuffer(num, 3);
        src.set(0, 50);
        src.set(1, 70000);
        src.set(2, -5);
        const capped = { type: "integer", minimum: 0, maximum: 100 } as const satisfies Schema;
        const out = convertTypedBuffer(src, capped);
        expect([out.get(0), out.get(1), out.get(2)]).toEqual([50, 100, 0]);
    });
});

describe("convertTypedBuffer — struct (value-type) buffers", () => {
    const vec2 = { type: "object", properties: { x: f32, y: f32 } } as const satisfies Schema;

    it("the source is actually a struct buffer (sanity)", () => {
        expect(createTypedBuffer(vec2, 1).type).toBe("struct");
    });

    it("reorders struct fields", () => {
        const src = createTypedBuffer(vec2, 1);
        src.set(0, { x: 1, y: 2 });
        const reordered = { type: "object", properties: { y: f32, x: f32 } } as const satisfies Schema;
        const out = convertTypedBuffer(src, reordered);
        expect(out.get(0)).toEqual({ x: 1, y: 2 });
    });

    it("adds a struct field from its default", () => {
        const src = createTypedBuffer(vec2, 1);
        src.set(0, { x: 1, y: 2 });
        const vec3 = { type: "object", properties: { x: f32, y: f32, z: { type: "number", precision: 1, default: 7 } } } as const satisfies Schema;
        const out = convertTypedBuffer(src, vec3);
        expect(out.get(0)).toEqual({ x: 1, y: 2, z: 7 });
    });

    it("clamps a struct field on convert", () => {
        const src = createTypedBuffer(vec2, 1);
        src.set(0, { x: 50, y: 3 });
        const clamped = { type: "object", properties: { x: { type: "number", precision: 1, maximum: 10 }, y: f32 } } as const satisfies Schema;
        const out = convertTypedBuffer(src, clamped);
        expect(out.get(0)).toEqual({ x: 10, y: 3 });
    });
});

describe("convertTypedBuffer — array (object-holding) buffers", () => {
    // f64 object properties do NOT pack as a struct → these are array buffers.
    const ab = { type: "object", properties: { a: num, b: num } } as const satisfies Schema;

    it("the source is actually an array buffer (sanity)", () => {
        expect(createTypedBuffer(ab, 1).type).toBe("array");
    });

    it("adds a field from its default across every element", () => {
        const src = createTypedBuffer(ab, 2);
        src.set(0, { a: 1, b: 2 });
        src.set(1, { a: 3, b: 4 });
        const abc = { type: "object", properties: { a: num, b: num, c: { type: "number", default: 5 } } } as const satisfies Schema;
        const out = convertTypedBuffer(src, abc);
        expect(out.get(0)).toEqual({ a: 1, b: 2, c: 5 });
        expect(out.get(1)).toEqual({ a: 3, b: 4, c: 5 });
    });

    it("drops a field the target does not declare", () => {
        const src = createTypedBuffer(ab, 1);
        src.set(0, { a: 1, b: 2 });
        const justA = { type: "object", properties: { a: num } } as const satisfies Schema;
        const out = convertTypedBuffer(src, justA);
        expect(out.get(0)).toEqual({ a: 1 });
    });
});

describe("convertTypedBuffer — enum & const", () => {
    it("widens an enum buffer", () => {
        const src = createTypedBuffer({ enum: ["a", "b"], default: "a" }, 2);
        src.set(0, "a");
        src.set(1, "b");
        const out = convertTypedBuffer(src, { enum: ["a", "b", "c"], default: "a" });
        expect([out.get(0), out.get(1)]).toEqual(["a", "b"]);
    });
});

describe("convertTypedBuffer — not convertible", () => {
    it("throws when no automatic conversion exists", () => {
        const src = createTypedBuffer(num, 1);
        expect(() => convertTypedBuffer(src, { type: "object", properties: { x: f32 } })).toThrow(
            /No automatic TypedBuffer conversion/,
        );
    });
});
