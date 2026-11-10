// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Schema } from "@adobe/ecs";
import { describe, expect, it } from "vitest";
import { fromJson, toJson } from "./values.js";

const through = (schema: Schema, value: unknown): unknown => fromJson(schema, JSON.parse(JSON.stringify(toJson(schema, value))));

describe("values as JSON", () => {
    it("read back numbers JSON lacks", () => {
        const numbers: Schema = { type: "array", items: { type: "number" } };
        expect(through(numbers, [NaN, Infinity, -Infinity, -0, 1.5])).toEqual([NaN, Infinity, -Infinity, -0, 1.5]);
        const zero = through(numbers, [-0]);
        expect(Array.isArray(zero) && Object.is(zero[0], -0)).toBe(true);
    });

    it("read back maps, sets and objects without the fields they lack", () => {
        const schema: Schema = { type: "object", properties: { counts: { type: "map", keys: { type: "string" }, values: { type: "number" } }, seen: { type: "set", items: { type: "string" } }, note: { type: "string" } }, required: ["counts", "seen"] };
        expect(through(schema, { counts: new Map([["a", 1]]), seen: new Set(["x"]) })).toEqual({ counts: new Map([["a", 1]]), seen: new Set(["x"]) });
    });

    it("read back typed arrays as the typed arrays they were, with numbers JSON lacks", () => {
        expect(through({ type: "typedArray", array: "Uint8Array", length: 3 }, new Uint8Array([1, 2, 255]))).toEqual(new Uint8Array([1, 2, 255]));
        const floats = through({ type: "typedArray", array: "Float64Array", length: 3 }, new Float64Array([NaN, -0, 1.5]));
        expect(floats).toBeInstanceOf(Float64Array);
        expect(floats instanceof Float64Array && Object.is(floats[1], -0) && Number.isNaN(floats[0])).toBe(true);
    });

    it("read back a union's values as the members they were, a string as a string and a number as a number", () => {
        const schema: Schema = { anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }, { type: "set", items: { type: "number" } }, { type: "array", items: { type: "number" } }] };
        const values = ["NaN", NaN, 2, null, new Set([1]), [1]];
        expect(values.map(value => through(schema, value))).toEqual(values);
    });
    it("read back a union's typed arrays as the typed array members they were", () => {
        const schema: Schema = { anyOf: [{ type: "typedArray", array: "Uint8Array" }, { type: "typedArray", array: "Float64Array" }] };
        const values = [new Uint8Array([1, 255]), new Float64Array([1.5, -0])];
        expect(values.map(value => through(schema, value))).toEqual(values);
    });

    it("write a union's typed array as the member of its length", () => {
        const schema: Schema = { anyOf: [{ type: "typedArray", array: "Float32Array", length: 2 }, { type: "typedArray", array: "Float32Array", length: 3 }] };
        expect(toJson(schema, new Float32Array([1, 2, 3]))).toEqual([1, [1, 2, 3]]);
    });

    it("read back a union's typed array as a typed array when an object member comes before it", () => {
        const schema: Schema = { anyOf: [{ type: "object", properties: {} }, { type: "typedArray", array: "Float64Array" }] };
        expect(through(schema, new Float64Array([1.5]))).toEqual(new Float64Array([1.5]));
    });
});
