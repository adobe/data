// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { isAdjacent } from "./is-adjacent.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Z } from "./pos-z.js";

describe("isAdjacent", () => {
    it("is true when faces share an edge", () => {
        expect(isAdjacent(POS_Z, POS_X)).toBe(true);
    });

    it("is false for opposite faces", () => {
        expect(isAdjacent(POS_Z, NEG_Z)).toBe(false);
    });
});
