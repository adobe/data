// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { compare } from "./compare.js";
import type { FractionalIndex } from "./fractional-index.js";

const fi = (s: string) => s as FractionalIndex;

describe("FractionalIndex.compare", () => {
    it("orders by code point, not locale collation", () => {
        // ASCII code points: '0'(48) < 'A'(65) < 'Z'(90) < 'a'(97).
        // A locale-aware compare (localeCompare) would interleave case
        // (e.g. 'a' before 'Z'), so these assertions fail if the comparator
        // is ever switched to localeCompare — the no-locale guard.
        expect(compare(fi("Z"), fi("a"))).toBeLessThan(0);     // 'Z'(90) < 'a'(97)
        expect(compare(fi("a"), fi("Z"))).toBeGreaterThan(0);
        expect(compare(fi("0"), fi("A"))).toBeLessThan(0);     // '0'(48) < 'A'(65)
        expect(compare(fi("A"), fi("A"))).toBe(0);
    });

    it("sorts an array strictly by code point", () => {
        const keys = ["a", "Z", "0", "A", "a0", "Zz"].map(fi);
        const sorted = [...keys].sort(compare);
        expect(sorted).toEqual(["0", "A", "Z", "Zz", "a", "a0"].map(fi));
    });
});
