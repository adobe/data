// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { between } from "./between.js";
import type { FractionalIndex } from "./fractional-index.js";

const fi = (s: string) => s as FractionalIndex;

describe("between", () => {
    it("returns initial when both bounds are undefined", () => {
        expect(between(undefined, undefined)).toBe("a0");
    });

    it("generates keys before an existing key", () => {
        expect(between(undefined, fi("a0"))).toBe("Zz");
        expect(between(undefined, fi("Y00"))).toBe("Xzzz");
        expect(between(undefined, fi("a0V"))).toBe("a0");
        expect(between(undefined, fi("b999"))).toBe("b99");
        expect(between(undefined, fi("A000000000000000000000000001"))).toBe("A000000000000000000000000000V");
    });

    it("generates keys after an existing key", () => {
        expect(between(fi("a0"), undefined)).toBe("a1");
        expect(between(fi("bzz"), undefined)).toBe("c000");
        expect(between(fi("zzzzzzzzzzzzzzzzzzzzzzzzzzy"), undefined)).toBe("zzzzzzzzzzzzzzzzzzzzzzzzzzz");
        expect(between(fi("zzzzzzzzzzzzzzzzzzzzzzzzzzz"), undefined)).toBe("zzzzzzzzzzzzzzzzzzzzzzzzzzzV");
    });

    it("generates keys between two existing keys", () => {
        expect(between(fi("a0"), fi("a1"))).toBe("a0V");
        expect(between(fi("a0V"), fi("a1"))).toBe("a0l");
        expect(between(fi("Zz"), fi("a0"))).toBe("ZzV");
        expect(between(fi("Zz"), fi("a1"))).toBe("a0");
        expect(between(fi("a0"), fi("a0V"))).toBe("a0G");
        expect(between(fi("a0"), fi("a0G"))).toBe("a08");
        expect(between(fi("b125"), fi("b129"))).toBe("b127");
        expect(between(fi("a0"), fi("a1V"))).toBe("a1");
        expect(between(fi("Zz"), fi("a01"))).toBe("a0");
    });

    it("throws for invalid key (smallest integer)", () => {
        expect(() => between(undefined, fi("A00000000000000000000000000"))).toThrow("invalid order key");
    });

    it("throws for trailing zero in fractional part", () => {
        expect(() => between(undefined, fi("b0"))).toThrow("invalid order key");
        expect(() => between(fi("a00"), undefined)).toThrow("invalid order key");
        expect(() => between(fi("a00"), fi("a1"))).toThrow("invalid order key");
    });

    it("throws when head is a digit instead of a letter", () => {
        expect(() => between(fi("0"), fi("1"))).toThrow("Invalid order key head");
    });

    it("throws when a >= b", () => {
        expect(() => between(fi("a1"), fi("a0"))).toThrow("Invalid key order: a >= b");
    });

    it("max length for 100k consecutive appends is 4 chars", () => {
        let current: FractionalIndex = fi("a0");
        let maxLen = current.length;
        for (let i = 0; i < 100_000; i++) {
            current = between(current, undefined);
            if (current.length > maxLen) maxLen = current.length;
        }
        expect(maxLen).toBe(4);
    });

    it("max length for 500 consecutive head-inserts is 86 chars", () => {
        let next: FractionalIndex | undefined;
        let maxLen = 0;
        for (let i = 0; i < 500; i++) {
            next = between(fi("a0"), next);
            if (next.length > maxLen) maxLen = next.length;
        }
        expect(maxLen).toBe(86);
    });
});
