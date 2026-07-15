// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from "vitest";
import { Entity } from "./entity.js";

describe("Entity.isNonPersistent", () => {
    it("should return true for negative entity IDs", () => {
        expect(Entity.isNonPersistent(-1)).toBe(true);
        expect(Entity.isNonPersistent(-100)).toBe(true);
    });

    it("should return false for non-negative entity IDs", () => {
        expect(Entity.isNonPersistent(0)).toBe(false);
        expect(Entity.isNonPersistent(1)).toBe(false);
        expect(Entity.isNonPersistent(100)).toBe(false);
    });
});

describe("Entity.isPersistent", () => {
    it("should return true for non-negative entity IDs", () => {
        expect(Entity.isPersistent(0)).toBe(true);
        expect(Entity.isPersistent(1)).toBe(true);
        expect(Entity.isPersistent(100)).toBe(true);
    });

    it("should return false for negative entity IDs", () => {
        expect(Entity.isPersistent(-1)).toBe(false);
        expect(Entity.isPersistent(-100)).toBe(false);
    });
});
