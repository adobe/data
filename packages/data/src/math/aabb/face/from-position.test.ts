// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { fromPosition } from "./from-position.js";
import { NEG_X } from "./neg-x.js";
import { NEG_Y } from "./neg-y.js";
import { NEG_Z } from "./neg-z.js";
import { POS_X } from "./pos-x.js";
import { POS_Y } from "./pos-y.js";
import { POS_Z } from "./pos-z.js";

describe("fromPosition", () => {
    it("selects the dominant-axis face on a unit cube", () => {
        const aabb = { min: [-1, -1, -1] as const, max: [1, 1, 1] as const };
        expect(fromPosition([1, 0, 0], aabb)).toBe(POS_X);
        expect(fromPosition([-1, 0, 0], aabb)).toBe(NEG_X);
        expect(fromPosition([0, 1, 0], aabb)).toBe(POS_Y);
        expect(fromPosition([0, -1, 0], aabb)).toBe(NEG_Y);
        expect(fromPosition([0, 0, 1], aabb)).toBe(POS_Z);
        expect(fromPosition([0, 0, -1], aabb)).toBe(NEG_Z);
    });
});
