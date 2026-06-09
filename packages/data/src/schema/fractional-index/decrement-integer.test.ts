// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { decrementInteger } from "./decrement-integer.js";

describe("decrementInteger", () => {
    it("decrements simple keys", () => {
        expect(decrementInteger("a1")).toBe("a0");
        expect(decrementInteger("a2")).toBe("a1");
    });

    it("borrows across digit positions", () => {
        expect(decrementInteger("b00")).toBe("az");
        expect(decrementInteger("b10")).toBe("b0z");
        expect(decrementInteger("b20")).toBe("b1z");
        expect(decrementInteger("c000")).toBe("bzz");
        expect(decrementInteger("dAC00")).toBe("dABzz");
    });

    it("crosses the positive/negative boundary", () => {
        expect(decrementInteger("Zz")).toBe("Zy");
        expect(decrementInteger("a0")).toBe("Zz");
    });

    it("handles transitions that lengthen the integer part (negative side)", () => {
        expect(decrementInteger("Yzz")).toBe("Yzy");
        expect(decrementInteger("Z0")).toBe("Yzz");
        expect(decrementInteger("Xz00")).toBe("Xyzz");
        expect(decrementInteger("Xz01")).toBe("Xz00");
        expect(decrementInteger("Y00")).toBe("Xzzz");
    });

    it("returns undefined at the bottom of range", () => {
        expect(decrementInteger("A00000000000000000000000000")).toBeUndefined();
    });
});
