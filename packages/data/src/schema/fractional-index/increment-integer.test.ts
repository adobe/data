// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { incrementInteger } from "./increment-integer.js";

describe("incrementInteger", () => {
    it("increments simple keys", () => {
        expect(incrementInteger("a0")).toBe("a1");
        expect(incrementInteger("a1")).toBe("a2");
    });

    it("carries across digit positions", () => {
        expect(incrementInteger("az")).toBe("b00");
        expect(incrementInteger("b0z")).toBe("b10");
        expect(incrementInteger("b1z")).toBe("b20");
        expect(incrementInteger("bzz")).toBe("c000");
        expect(incrementInteger("dABzz")).toBe("dAC00");
    });

    it("crosses the negative/positive boundary", () => {
        expect(incrementInteger("Zy")).toBe("Zz");
        expect(incrementInteger("Zz")).toBe("a0");
    });

    it("handles transitions that shorten the integer part (negative side)", () => {
        expect(incrementInteger("Yzy")).toBe("Yzz");
        expect(incrementInteger("Yzz")).toBe("Z0");
        expect(incrementInteger("Xyzz")).toBe("Xz00");
        expect(incrementInteger("Xz00")).toBe("Xz01");
        expect(incrementInteger("Xzzz")).toBe("Y00");
    });

    it("returns undefined at the top of range", () => {
        expect(incrementInteger("zzzzzzzzzzzzzzzzzzzzzzzzzzz")).toBeUndefined();
    });

    it("throws on invalid integer length", () => {
        expect(() => incrementInteger("b0")).toThrow("invalid integer part of order key");
    });
});
