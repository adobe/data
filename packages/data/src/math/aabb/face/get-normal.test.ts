// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { getNormal } from "./get-normal.js";
import { POS_Z } from "./pos-z.js";

describe("getNormal", () => {
    it("returns outward unit normal for a valid face", () => {
        expect(getNormal(POS_Z)).toEqual([0, 0, 1]);
    });

    it("throws for invalid face index", () => {
        expect(() => getNormal(6 as any)).toThrow("Invalid face index: 6");
    });
});
