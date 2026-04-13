// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Entity } from "./entity.js";

describe("Entity.isEphemeral", () => {
    it("should return true for negative entity IDs", () => {
        expect(Entity.isEphemeral(-1)).toBe(true);
        expect(Entity.isEphemeral(-100)).toBe(true);
    });

    it("should return false for non-negative entity IDs", () => {
        expect(Entity.isEphemeral(0)).toBe(false);
        expect(Entity.isEphemeral(1)).toBe(false);
        expect(Entity.isEphemeral(100)).toBe(false);
    });
});
