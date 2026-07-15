// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { getDenseIndex } from "./get-dense-index.js";

describe("getDenseIndex", () => {
    it("maps coordinates to row-major dense indices", () => {
        const size = [3, 2, 2] as const;
        expect(getDenseIndex(size, 0, 0, 0)).toBe(0);
        expect(getDenseIndex(size, 2, 0, 0)).toBe(2);
        expect(getDenseIndex(size, 0, 1, 0)).toBe(3);
        expect(getDenseIndex(size, 1, 0, 1)).toBe(7);
    });

    it("matches standard layout for non-cubic block sizes", () => {
        const size = [8, 4, 4] as const;
        expect(getDenseIndex(size, 1, 2, 3)).toBe(1 + 8 * (2 + 4 * 3));
    });
});
