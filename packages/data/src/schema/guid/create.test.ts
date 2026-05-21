// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Guid } from "./index.js";

describe("Guid.create", () => {
    it("returns a 4-element tuple of numbers", () => {
        const g = Guid.create();
        expect(g).toHaveLength(4);
        expect(typeof g[0]).toBe("number");
        expect(typeof g[1]).toBe("number");
        expect(typeof g[2]).toBe("number");
        expect(typeof g[3]).toBe("number");
    });

    it("all elements are in u32 range [0, 4294967295]", () => {
        const g = Guid.create();
        for (const n of g) {
            expect(n).toBeGreaterThanOrEqual(0);
            expect(n).toBeLessThanOrEqual(0xFFFFFFFF);
        }
    });

    it("sets RFC 4122 v4 version nibble (bits 48-51 = 0100)", () => {
        const g = Guid.create();
        // Version nibble is bits [15:12] of g[1]
        const versionNibble = (g[1] >>> 12) & 0xF;
        expect(versionNibble).toBe(4);
    });

    it("sets RFC 4122 variant (top 2 bits of g[2] = 10)", () => {
        const g = Guid.create();
        const variantBits = (g[2] >>> 30) & 0x3;
        expect(variantBits).toBe(0b10);
    });

    it("generates unique values", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 100; i++) {
            seen.add(Guid.toString(Guid.create()));
        }
        expect(seen.size).toBe(100);
    });
});
