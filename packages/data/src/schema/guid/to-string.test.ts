// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Guid } from "./index.js";

const CANONICAL_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("Guid.toString", () => {
    it("produces the canonical 36-character form", () => {
        const g: Guid = [0x12345678, 0x9abcdef0, 0x11223344, 0x55667788];
        const s = Guid.toString(g);
        expect(s).toHaveLength(36);
        expect(CANONICAL_RE.test(s)).toBe(true);
    });

    it("encodes a known Guid to the expected string", () => {
        // [0x12345678, 0x9abcdef0, 0x11223344, 0x55667788]
        // a=12345678, b_hi=9abc, b_lo=def0, c_hi=1122, c_lo=3344, d=55667788
        const g: Guid = [0x12345678, 0x9abcdef0, 0x11223344, 0x55667788];
        expect(Guid.toString(g)).toBe("12345678-9abc-def0-1122-334455667788");
    });

    it("handles nil (all zeros)", () => {
        expect(Guid.toString(Guid.nil)).toBe("00000000-0000-0000-0000-000000000000");
    });

    it("handles max u32 values", () => {
        const g: Guid = [0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF, 0xFFFFFFFF];
        expect(Guid.toString(g)).toBe("ffffffff-ffff-ffff-ffff-ffffffffffff");
    });

    it("round-trips with a created Guid", () => {
        const g = Guid.create();
        const s = Guid.toString(g);
        expect(CANONICAL_RE.test(s)).toBe(true);
    });
});
