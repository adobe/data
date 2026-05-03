// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { getOpposite } from "./get-opposite.js";
import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

describe("getOpposite", () => {
    it("maps each axis to its opposite", () => {
        expect(getOpposite(POS_Z)).toBe(NEG_Z);
        expect(getOpposite(POS_X)).toBe(NEG_X);
        expect(getOpposite(POS_Y)).toBe(NEG_Y);
    });

    it("throws for invalid face index", () => {
        expect(() => getOpposite(6 as any)).toThrow("Invalid face index: 6");
    });
});
