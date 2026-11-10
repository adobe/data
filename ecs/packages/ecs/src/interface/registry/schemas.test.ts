// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import type { Schema } from "../schema/schema.js";
import { integerRangeAt } from "./schemas.js";

describe("integerRangeAt", () => {
    const stats = {
        type: "object",
        properties: {
            atk: { type: "integer", minimum: 0, maximum: 1000 },
            hp: { type: "integer", minimum: -5 },
            level: { anyOf: [{ const: 1 }, { const: 2 }, { const: 3 }] },
            cells: { type: "array", items: { type: "integer", minimum: 0, maximum: 255 }, minItems: 2, maxItems: 2 },
            speed: { type: "number", minimum: 0, maximum: 1 },
        },
    } as const satisfies Schema;

    it("gives an integer leaf's declared least and greatest, a union of integer constants' too, by its path", () => {
        expect(integerRangeAt(stats, ["atk"])).toEqual([0, 1000]);
        expect(integerRangeAt(stats, ["level"])).toEqual([1, 3]);
        expect(integerRangeAt(stats, ["cells", 1])).toEqual([0, 255]);
        expect(integerRangeAt({ type: "integer", minimum: -3, maximum: 3 }, [])).toEqual([-3, 3]);
    });

    it("gives none for a leaf without both bounds, one that isn't an integer, an entity or a path naming nothing", () => {
        expect(integerRangeAt(stats, ["hp"])).toBeNull();
        expect(integerRangeAt(stats, ["speed"])).toBeNull();
        expect(integerRangeAt(stats, ["missing"])).toBeNull();
        expect(integerRangeAt({ type: "integer", format: "entity" }, [])).toBeNull();
    });
});
