// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Schema } from "../schema/schema.js";
import { threadOfDeclaration } from "./declarations.js";
import { layoutOf } from "./layout.js";
import { allowsNull, conditional, hasBoolean, isStruct } from "./schemas.js";

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

    it("stores a union of number constants as a number column: integers at the narrowest width holding them", () => {
        const views = (schema: Schema) => {
            const layout = layoutOf(schema);
            return layout.kind === "linear" ? layout.leaves.map(leaf => leaf.view) : layout.kind;
        };
        expect(views({ anyOf: [{ const: 0 }, { const: 1 }, { const: 2 }] })).toEqual(["u32"]);
        expect(views({ anyOf: [{ const: 1 }, { const: -1 }] })).toEqual(["i32"]);
        expect(views({ anyOf: [{ const: 0.5 }, { const: 1 }] })).toEqual(["f64"]);
        expect(views({ anyOf: [{ const: 0 }, { const: 2 ** 40 }] })).toEqual(["f64"]);
        // An integer column would store -0 as 0.
        expect(views({ anyOf: [{ const: -0 }, { const: 1 }] })).toEqual(["f64"]);
        expect(views({ type: "object", properties: { mode: { anyOf: [{ const: 0 }, { const: 1 }] }, at: f32 } })).toEqual(["u32", "f32"]);
        expect(views({ anyOf: [{ const: 0 }, { const: "a" }] })).toBe("object");
        expect(views({ anyOf: [{ const: 0 }, { type: "null" }] })).toBe("object");
        // A struct, so it lives in shared memory, on no thread.
        expect(isStruct({ anyOf: [{ const: 0 }, { const: 1 }] })).toBe(true);
        expect(threadOfDeclaration({ type: { anyOf: [{ const: 0 }, { const: 1 }] } })).toBe(null);
    });

    it("stores sets and maps as objects, even of numbers, and nothing in them as a struct", () => {
        const set: Schema = { type: "set", items: { type: "number" } };
        const map: Schema = { type: "map", keys: { type: "integer", minimum: 0, maximum: 9 }, values: { type: "boolean" } };
        expect([layoutOf(set).kind, layoutOf(map).kind]).toEqual(["object", "object"]);
        expect(layoutOf({ type: "object", properties: { at: f32, marks: set } }).kind).toBe("object");
        expect([isStruct(set), isStruct(map), hasBoolean(map), allowsNull(set), conditional(map)]).toEqual([false, false, false, false, false]);
        expect(threadOfDeclaration({ type: map })).toBe("world");
        expect(() => layoutOf({ type: "array", layout: "storage", items: set, minItems: 2, maxItems: 2 })).toThrow("storage layout needs");
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

    it("reads and writes structs of every leaf kind, nested and with any member name", () => {
        const integer: Schema = { type: "integer", minimum: 0, maximum: 255 };
        const layout = layoutOf({
            type: "object",
            properties: {
                ["__proto__"]: f32,
                flag: { type: "boolean" },
                count: integer,
                at: vec(2),
                inner: { type: "object", properties: { x: { type: "number" }, pairs: { type: "array", items: vec(2), minItems: 2, maxItems: 2 } } },
            },
        });
        if (layout.kind !== "linear") throw new Error("not linear");
        const buffer = new ArrayBuffer(256);
        const views = { f32: new Float32Array(buffer), f64: new Float64Array(buffer), i32: new Int32Array(buffer), u32: new Uint32Array(buffer), u8: new Uint8Array(buffer) };
        const value = JSON.parse('{ "__proto__": 0.5, "flag": true, "count": 7, "at": [1, 2], "inner": { "x": 0.25, "pairs": [[3, 4], [5, 6]] } }');
        layout.write(views, 1, value);
        const read = layout.read(views, 1);
        expect(read).toEqual(value);
        expect(Object.getPrototypeOf(read)).toBe(Object.prototype);
        layout.write(views, 1, { flag: false, count: 1, at: [0, 0] });
        expect(layout.read(views, 1)).toEqual(JSON.parse('{ "__proto__": null, "flag": false, "count": 1, "at": [0, 0], "inner": { "x": null, "pairs": [[null, null], [null, null]] } }', (_, leaf: unknown) => leaf === null ? NaN : leaf));
    });
});
