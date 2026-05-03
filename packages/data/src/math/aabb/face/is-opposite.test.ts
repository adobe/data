// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { isOpposite } from "./is-opposite.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Z } from "./pos-z.js";

describe("isOpposite", () => {
    it("is true for opposite pair", () => {
        expect(isOpposite(POS_Z, NEG_Z)).toBe(true);
    });

    it("is false for adjacent faces", () => {
        expect(isOpposite(POS_Z, POS_X)).toBe(false);
    });
});
