// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { getStructLayout } from "./get-struct-layout.js";
import { isStructLayoutZeroValue } from "./is-struct-layout-zero-value.js";
import type { Schema } from "../../schema/index.js";

describe("isStructLayoutZeroValue", () => {
    it("accepts numeric zero primitives", () => {
        expect(isStructLayoutZeroValue("f32", 0)).toBe(true);
        expect(isStructLayoutZeroValue("i32", 0)).toBe(true);
        expect(isStructLayoutZeroValue("u32", 0)).toBe(true);
        expect(isStructLayoutZeroValue("f32", 1)).toBe(false);
        expect(isStructLayoutZeroValue("f32", NaN)).toBe(false);
    });

    it("accepts zero object structs", () => {
        const schema = {
            type: "object",
            properties: {
                x: { type: "number", precision: 1 },
                y: { type: "number", precision: 1 },
            },
        } as const satisfies Schema;
        const layout = getStructLayout(schema)!;
        expect(isStructLayoutZeroValue(layout, { x: 0, y: 0 })).toBe(true);
        expect(isStructLayoutZeroValue(layout, { x: 1, y: 0 })).toBe(false);
    });

    it("accepts zero tuple (array layout root)", () => {
        const schema = {
            type: "array",
            items: { type: "number", precision: 1 },
            minItems: 3,
            maxItems: 3,
        } as const satisfies Schema;
        const layout = getStructLayout(schema)!;
        expect(isStructLayoutZeroValue(layout, [0, 0, 0])).toBe(true);
        expect(isStructLayoutZeroValue(layout, [0, 1, 0])).toBe(false);
    });
});
