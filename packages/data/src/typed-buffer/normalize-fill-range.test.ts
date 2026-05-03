// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { normalizeFillRange } from "./normalize-fill-range.js";

describe("normalizeFillRange", () => {
    it("defaults to full length", () => {
        expect(normalizeFillRange(10)).toEqual([0, 10]);
        expect(normalizeFillRange(10, undefined, undefined)).toEqual([0, 10]);
    });

    it("clamps start and end into [0, length]", () => {
        expect(normalizeFillRange(10, 2, 7)).toEqual([2, 7]);
        expect(normalizeFillRange(10, -5, 99)).toEqual([0, 10]);
    });

    it("treats NaN as 0 for start", () => {
        expect(normalizeFillRange(10, NaN, 4)).toEqual([0, 4]);
    });

    it("returns null when start >= end after clamp", () => {
        expect(normalizeFillRange(10, 7, 3)).toBe(null);
        expect(normalizeFillRange(10, 10, 5)).toBe(null);
        expect(normalizeFillRange(5, 3, 3)).toBe(null);
    });

    it("returns null for zero length", () => {
        expect(normalizeFillRange(0)).toBe(null);
    });
});
