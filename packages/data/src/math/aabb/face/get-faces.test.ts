// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { getFaces } from "./get-faces.js";
import { NEG_X } from "./neg-x.js";
import { POS_X } from "./pos-x.js";
import { POS_Z } from "./pos-z.js";

describe("getFaces", () => {
    it("yields each set single-face bit", () => {
        const mask = POS_Z | POS_X;
        expect([...getFaces(mask)]).toEqual([POS_Z, POS_X]);
    });

    it("yields NEG_X when only that bit is set", () => {
        expect([...getFaces(NEG_X)]).toEqual([NEG_X]);
    });
});
