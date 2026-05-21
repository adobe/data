// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { betweenN } from "./between-n.js";
import type { FractionalIndex } from "./fractional-index.js";

const fi = (s: string) => s as FractionalIndex;

describe("betweenN", () => {
    it("returns empty array for n = 0", () => {
        expect(betweenN(undefined, undefined, 0)).toEqual([]);
    });

    it("generates n keys between undefined bounds", () => {
        expect(betweenN(undefined, undefined, 5).join(" ")).toBe("a0 a1 a2 a3 a4");
    });

    it("generates n keys after a lower bound", () => {
        expect(betweenN(fi("a4"), undefined, 10).join(" ")).toBe(
            "a5 a6 a7 a8 a9 aA aB aC aD aE",
        );
    });

    it("generates n keys before an upper bound", () => {
        expect(betweenN(undefined, fi("a0"), 5).join(" ")).toBe("Zv Zw Zx Zy Zz");
    });

    it("generates n keys between two bounds (shared integer part)", () => {
        expect(betweenN(fi("a0"), fi("a2"), 20).join(" ")).toBe(
            "a04 a08 a0G a0K a0O a0V a0Z a0d a0l a0t a1 a14 a18 a1G a1O a1V a1Z a1d a1l a1t",
        );
    });

    it("keys are in strictly ascending order", () => {
        const keys = betweenN(fi("a0"), fi("b00"), 50);
        for (let i = 1; i < keys.length; i++) {
            expect(keys[i] > keys[i - 1]).toBe(true);
        }
    });

    it("bulk insert of 500 keys grows length by at most 2 chars", () => {
        const start = fi("a0");
        const end = betweenN(start, undefined, 1)[0];
        const keys = betweenN(start, end, 500);
        const baseline = Math.max(start.length, end.length);
        const maxLen = keys.reduce((m, k) => Math.max(m, k.length), 0);
        expect(maxLen).toBe(baseline + 2);
    });
});
