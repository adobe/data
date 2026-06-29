// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { getDenseIndex, isInBounds, localBlockIndex } from "./volume-index.js";

describe("volume-index", () => {
    it("maps coordinates to row-major dense indices", () => {
        const size = [3, 2, 2] as const;
        expect(getDenseIndex(size, 0, 0, 0)).toBe(0);
        expect(getDenseIndex(size, 2, 0, 0)).toBe(2);
        expect(getDenseIndex(size, 0, 1, 0)).toBe(3);
        expect(getDenseIndex(size, 1, 0, 1)).toBe(7);
    });

    it("checks bounds", () => {
        const size = [2, 2, 2] as const;
        expect(isInBounds(size, 0, 0, 0)).toBe(true);
        expect(isInBounds(size, 2, 0, 0)).toBe(false);
        expect(isInBounds(size, -1, 0, 0)).toBe(false);
    });

    it("maps local block coordinates", () => {
        expect(localBlockIndex(1, 2, 3, 4)).toBe(1 + 4 * (2 + 4 * 3));
    });
});
