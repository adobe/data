// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { Guid } from "./index.js";

describe("Guid.fromString", () => {
    it("parses a canonical lowercase UUID string", () => {
        const g = Guid.fromString("12345678-9abc-def0-1122-334455667788");
        expect(g).toEqual([0x12345678, 0x9abcdef0, 0x11223344, 0x55667788]);
    });

    it("parses uppercase hex", () => {
        const g = Guid.fromString("12345678-9ABC-DEF0-1122-334455667788");
        expect(g).toEqual([0x12345678, 0x9abcdef0, 0x11223344, 0x55667788]);
    });

    it("round-trips with toString", () => {
        const g: Guid = [0xdeadbeef, 0xcafebabe, 0x80004000, 0x01234567];
        expect(Guid.equals(Guid.fromString(Guid.toString(g)), g)).toBe(true);
    });

    it("round-trips a created Guid through toString/fromString", () => {
        const g = Guid.create();
        expect(Guid.equals(Guid.fromString(Guid.toString(g)), g)).toBe(true);
    });

    it("round-trips with crypto.randomUUID() strings", () => {
        const uuidStr = crypto.randomUUID();
        const g = Guid.fromString(uuidStr);
        expect(Guid.toString(g)).toBe(uuidStr.toLowerCase());
    });

    it("throws TypeError for wrong length", () => {
        expect(() => Guid.fromString("12345678-9abc-def0-1122-33445566778")).toThrow(TypeError);
    });

    it("throws TypeError for missing dashes", () => {
        expect(() => Guid.fromString("123456789abcdef011223344556677881")).toThrow(TypeError);
    });

    it("throws TypeError for non-hex characters", () => {
        expect(() => Guid.fromString("12345678-9xyz-def0-1122-334455667788")).toThrow(TypeError);
    });

    it("throws TypeError for empty string", () => {
        expect(() => Guid.fromString("")).toThrow(TypeError);
    });
});
