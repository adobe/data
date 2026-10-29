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

    it("read back a union's values as the members they were, a string as a string and a number as a number", () => {
        const schema: Schema = { anyOf: [{ type: "string" }, { type: "number" }, { type: "null" }, { type: "set", items: { type: "number" } }, { type: "array", items: { type: "number" } }] };
        const values = ["NaN", NaN, 2, null, new Set([1]), [1]];
        expect(values.map(value => through(schema, value))).toEqual(values);
    });
});
