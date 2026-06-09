// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { compare } from "./compare.js";

describe("compare", () => {
    it("orders strings by code point, not locale collation", () => {
        // ASCII code points: '0'(48) < 'A'(65) < 'Z'(90) < 'a'(97).
        // A locale-aware compare (localeCompare) would interleave case
        // (e.g. 'a' before 'Z'), so these fail if compare is ever switched
        // to localeCompare — the no-locale guard.
        expect(compare("Z", "a")).toBeLessThan(0);     // 'Z'(90) < 'a'(97)
        expect(compare("a", "Z")).toBeGreaterThan(0);
        expect(compare("0", "A")).toBeLessThan(0);     // '0'(48) < 'A'(65)
        expect(compare("A", "A")).toBe(0);
    });

    it("sorts a string array strictly by code point", () => {
        const sorted = [...["a", "Z", "0", "A", "a0", "Zz"]].sort(compare);
        expect(sorted).toEqual(["0", "A", "Z", "Zz", "a", "a0"]);
    });

    it("orders numbers numerically", () => {
        expect(compare(2, 10)).toBeLessThan(0);
        expect([3, 1, 2, 10].sort(compare)).toEqual([1, 2, 3, 10]);
    });
});
