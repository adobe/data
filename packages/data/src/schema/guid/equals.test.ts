// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Guid } from "./index.js";

describe("Guid.equals", () => {
    it("returns true for identical Guids", () => {
        const g: Guid = [1, 2, 3, 4];
        expect(Guid.equals(g, g)).toBe(true);
    });

    it("returns true for two nil Guids", () => {
        expect(Guid.equals(Guid.nil, [0, 0, 0, 0])).toBe(true);
    });

    it("returns false when element 0 differs", () => {
        expect(Guid.equals([1, 2, 3, 4], [9, 2, 3, 4])).toBe(false);
    });

    it("returns false when element 1 differs", () => {
        expect(Guid.equals([1, 2, 3, 4], [1, 9, 3, 4])).toBe(false);
    });

    it("returns false when element 2 differs", () => {
        expect(Guid.equals([1, 2, 3, 4], [1, 2, 9, 4])).toBe(false);
    });

    it("returns false when element 3 differs", () => {
        expect(Guid.equals([1, 2, 3, 4], [1, 2, 3, 9])).toBe(false);
    });

    it("returns true for two created Guids that are copies", () => {
        const g = Guid.create();
        const copy: Guid = [g[0], g[1], g[2], g[3]];
        expect(Guid.equals(g, copy)).toBe(true);
    });
});
