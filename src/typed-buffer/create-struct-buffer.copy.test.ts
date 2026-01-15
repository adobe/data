// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { createStructBuffer } from "./create-struct-buffer.js";
import type { Schema } from "../schema/index.js";

describe("createStructBuffer.copy", () => {
    it("should deep-copy the underlying bytes and preserve capacity", () => {
        const schema: Schema = {
            type: "object",
            properties: {
                a: { type: "number", precision: 1 },
                b: { type: "number", precision: 1 },
                c: { type: "number", precision: 1 },
            },
            layout: "packed"
        };

        const buf = createStructBuffer(schema, 2);
        buf.set(0, { a: 1, b: 2, c: 3 });
        buf.set(1, { a: 4, b: 5, c: 6 });

        const copy = buf.copy();
        expect(copy.capacity).toBe(2);
        expect(copy.get(0)).toEqual({ a: 1, b: 2, c: 3 });
        expect(copy.get(1)).toEqual({ a: 4, b: 5, c: 6 });

        // Mutate original and ensure copy is unaffected
        buf.set(0, { a: 7, b: 8, c: 9 });
        expect(copy.get(0)).toEqual({ a: 1, b: 2, c: 3 });
    });
});


