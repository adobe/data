import { describe, expect, it } from "vitest";
import type { Schema } from "../schema/schema.js";
import { layoutOf } from "./layout.js";

const f32: Schema = { type: "number", precision: 1 };
const vec = (length: number, layout?: "storage" | "vertex"): Schema => ({ type: "array", items: f32, minItems: length, maxItems: length, ...layout === undefined ? {} : { layout } });

/** Byte offsets of each leaf, and the element stride. */
const placement = (schema: Schema): { readonly stride: number; readonly offsets: readonly number[] } => {
    const layout = layoutOf(schema);
    if (layout.kind !== "linear") throw new Error("not linear");
    return { stride: layout.stride, offsets: layout.leaves.map(leaf => leaf.offset) };
};

describe("layoutOf", () => {
    it("follows WGSL storage rules: vec3 aligned to 16 but 12 bytes, so a scalar packs after it", () => {
        expect(placement(vec(3, "storage"))).toEqual({ stride: 16, offsets: [0, 4, 8] });
        expect(placement(vec(2, "storage"))).toEqual({ stride: 8, offsets: [0, 4] });
        expect(placement({ type: "object", layout: "storage", properties: { position: vec(3), mass: f32 } })).toEqual({ stride: 16, offsets: [0, 4, 8, 12] });
        expect(placement({ type: "object", layout: "storage", properties: { mass: f32, position: vec(3) } })).toEqual({ stride: 32, offsets: [0, 16, 20, 24] });
        // array<vec3<f32>, 2>: elements at a 16-byte stride.
        expect(placement({ type: "array", layout: "storage", items: vec(3), minItems: 2, maxItems: 2 })).toEqual({ stride: 32, offsets: [0, 4, 8, 16, 20, 24] });
    });

    it("packs vertex layouts tightly at 4 bytes", () => {
        expect(placement(vec(3, "vertex"))).toEqual({ stride: 12, offsets: [0, 4, 8] });
        expect(placement({ type: "object", layout: "vertex", properties: { mass: f32, position: vec(3), flag: { type: "boolean" } } })).toEqual({ stride: 20, offsets: [0, 4, 8, 12, 16] });
    });

    it("packs CPU layouts tightly with natural alignment", () => {
        expect(placement(vec(3))).toEqual({ stride: 12, offsets: [0, 4, 8] });
        expect(placement({ type: "object", properties: { flag: { type: "boolean" }, weight: { type: "number" }, mass: f32 } })).toEqual({ stride: 24, offsets: [0, 8, 16] });
    });

    it("rejects GPU layouts the GPU can't share, naming the leaf", () => {
        expect(() => layoutOf({ type: "object", layout: "storage", properties: { mass: { type: "number" } } })).toThrow('["mass"] is f64');
        expect(() => layoutOf({ type: "array", layout: "vertex", items: { type: "string" }, minItems: 2, maxItems: 2 })).toThrow("vertex layout needs");
    });

    it("reads and writes interleaved values, leaving padding untouched", () => {
        const layout = layoutOf(vec(3, "storage"));
        if (layout.kind !== "linear") throw new Error("not linear");
        const buffer = new ArrayBuffer(64);
        const views = { f32: new Float32Array(buffer), f64: new Float64Array(buffer), i32: new Int32Array(buffer), u32: new Uint32Array(buffer), u8: new Uint8Array(buffer) };
        views.f32.fill(-1);
        layout.write(views, 1, [1, 2, 3]);
        expect(layout.read(views, 1)).toEqual([1, 2, 3]);
        expect([...views.f32.subarray(0, 8)]).toEqual([-1, -1, -1, -1, 1, 2, 3, -1]);
    });
});
