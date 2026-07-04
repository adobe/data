// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, expect, it } from "vitest";
import { isInBounds } from "./is-in-bounds.js";

describe("isInBounds", () => {
    it("checks bounds", () => {
        const size = [2, 2, 2] as const;
        expect(isInBounds(size, 0, 0, 0)).toBe(true);
        expect(isInBounds(size, 2, 0, 0)).toBe(false);
        expect(isInBounds(size, -1, 0, 0)).toBe(false);
    });
});
