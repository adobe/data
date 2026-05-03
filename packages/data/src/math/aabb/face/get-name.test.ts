// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { getName } from "./get-name.js";
import { POS_Z } from "./pos-z.js";

describe("getName", () => {
    it("returns label for known face bit", () => {
        expect(getName(POS_Z)).toBe("POS_Z");
    });

    it("returns unknown placeholder for invalid value", () => {
        expect(getName(99 as any)).toBe("Unknown(99)");
    });
});
