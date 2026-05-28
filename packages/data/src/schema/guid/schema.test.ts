// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { getStructLayout, createStructBuffer } from "../../typed-buffer/index.js";
import { Guid } from "./index.js";

describe("Guid schema — struct layout", () => {
    it("produces a valid struct layout of 16 bytes with 4 u32 fields", () => {
        const layout = getStructLayout(Guid.schema);
        expect(layout.size).toBe(16);
        expect(layout.type).toBe("array");
        expect(layout.fields["0"]).toEqual({ offset: 0, type: "u32" });
        expect(layout.fields["1"]).toEqual({ offset: 4, type: "u32" });
        expect(layout.fields["2"]).toEqual({ offset: 8, type: "u32" });
        expect(layout.fields["3"]).toEqual({ offset: 12, type: "u32" });
    });

    it("getStructLayout does not throw for the schema", () => {
        expect(() => getStructLayout(Guid.schema)).not.toThrow();
    });

    it("round-trips through a StructTypedBuffer", () => {
        const buf = createStructBuffer(Guid.schema, 4);
        const g: Guid = [0x12345678, 0x9abcdef0, 0x11223344, 0x55667788];
        buf.set(0, g);
        const result = buf.get(0);
        expect(Guid.equals(result, g)).toBe(true);
    });

    it("stores two distinct Guids independently", () => {
        const buf = createStructBuffer(Guid.schema, 4);
        const g1: Guid = [1, 2, 3, 4];
        const g2: Guid = [5, 6, 7, 8];
        buf.set(0, g1);
        buf.set(1, g2);
        expect(Guid.equals(buf.get(0), g1)).toBe(true);
        expect(Guid.equals(buf.get(1), g2)).toBe(true);
    });
});
