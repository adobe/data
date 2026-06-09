// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { midpoint } from "./midpoint.js";

const base10 = "0123456789";

describe("midpoint", () => {
    describe("base 10", () => {
        it("finds midpoints toward upper end", () => {
            expect(midpoint("", undefined, base10)).toBe("5");
            expect(midpoint("5", undefined, base10)).toBe("8");
            expect(midpoint("8", undefined, base10)).toBe("9");
            expect(midpoint("9", undefined, base10)).toBe("95");
            expect(midpoint("95", undefined, base10)).toBe("98");
            expect(midpoint("98", undefined, base10)).toBe("99");
            expect(midpoint("99", undefined, base10)).toBe("995");
        });

        it("finds midpoints between two values", () => {
            expect(midpoint("1", "2", base10)).toBe("15");
            expect(midpoint("001", "001002", base10)).toBe("001001");
            expect(midpoint("001", "001001", base10)).toBe("0010005");
            expect(midpoint("05", "1", base10)).toBe("08");
            expect(midpoint("111", "1128", base10)).toBe("112");
        });

        it("finds midpoints from empty string to upper bound", () => {
            expect(midpoint("", "5", base10)).toBe("3");
            expect(midpoint("", "3", base10)).toBe("2");
            expect(midpoint("", "2", base10)).toBe("1");
        });

        it("throws when a >= b", () => {
            expect(() => midpoint("2", "1", base10)).toThrow("Invalid midpoint args: a >= b");
            expect(() => midpoint("", "", base10)).toThrow("Invalid midpoint args: a >= b");
            expect(() => midpoint("11", "1", base10)).toThrow("Invalid midpoint args: a >= b");
        });

        it("throws on trailing zero", () => {
            expect(() => midpoint("0", "1", base10)).toThrow("trailing zero");
            expect(() => midpoint("1", "10", base10)).toThrow("trailing zero");
        });
    });

    describe("base 62", () => {
        it("finds midpoints toward upper end", () => {
            expect(midpoint("", undefined)).toBe("V");
            expect(midpoint("V", undefined)).toBe("l");
            expect(midpoint("l", undefined)).toBe("t");
            expect(midpoint("t", undefined)).toBe("x");
            expect(midpoint("x", undefined)).toBe("z");
            expect(midpoint("z", undefined)).toBe("zV");
            expect(midpoint("zV", undefined)).toBe("zl");
            expect(midpoint("zl", undefined)).toBe("zt");
            expect(midpoint("zt", undefined)).toBe("zx");
            expect(midpoint("zx", undefined)).toBe("zz");
            expect(midpoint("zz", undefined)).toBe("zzV");
        });

        it("finds midpoints between two values", () => {
            expect(midpoint("1", "2")).toBe("1V");
            expect(midpoint("001", "001002")).toBe("001001");
            expect(midpoint("001", "001001")).toBe("001000V");
            expect(midpoint("4zz", "5")).toBe("4zzV");
        });

        it("finds midpoints from empty string to upper bound", () => {
            expect(midpoint("", "V")).toBe("G");
            expect(midpoint("", "G")).toBe("8");
            expect(midpoint("", "8")).toBe("4");
            expect(midpoint("", "4")).toBe("2");
            expect(midpoint("", "2")).toBe("1");
            expect(midpoint("", "1")).toBe("0V");
            expect(midpoint("0V", "1")).toBe("0l");
            expect(midpoint("", "0G")).toBe("08");
            expect(midpoint("", "08")).toBe("04");
            expect(midpoint("", "04")).toBe("02");
            expect(midpoint("", "02")).toBe("01");
            expect(midpoint("", "01")).toBe("00V");
        });

        it("throws when a >= b", () => {
            expect(() => midpoint("2", "1")).toThrow("Invalid midpoint args: a >= b");
            expect(() => midpoint("", "")).toThrow("Invalid midpoint args: a >= b");
            expect(() => midpoint("11", "1")).toThrow("Invalid midpoint args: a >= b");
        });

        it("throws on trailing zero", () => {
            expect(() => midpoint("0", "1")).toThrow("trailing zero");
            expect(() => midpoint("1", "10")).toThrow("trailing zero");
        });
    });
});
