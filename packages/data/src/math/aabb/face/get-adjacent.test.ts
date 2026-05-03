// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { getAdjacent } from "./get-adjacent.js";
import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

describe("getAdjacent", () => {
    it("returns four edge neighbors for ±Z", () => {
        expect(getAdjacent(POS_Z)).toEqual([POS_X, NEG_X, POS_Y, NEG_Y]);
        expect(getAdjacent(NEG_Z)).toEqual([POS_X, NEG_X, POS_Y, NEG_Y]);
    });

    it("returns four edge neighbors for ±X", () => {
        expect(getAdjacent(POS_X)).toEqual([POS_Z, NEG_Z, POS_Y, NEG_Y]);
        expect(getAdjacent(NEG_X)).toEqual([POS_Z, NEG_Z, POS_Y, NEG_Y]);
    });

    it("returns four edge neighbors for ±Y", () => {
        expect(getAdjacent(POS_Y)).toEqual([POS_Z, NEG_Z, POS_X, NEG_X]);
        expect(getAdjacent(NEG_Y)).toEqual([POS_Z, NEG_Z, POS_X, NEG_X]);
    });

    it("throws for invalid face index", () => {
        expect(() => getAdjacent(6 as any)).toThrow("Invalid face index: 6");
    });
});
