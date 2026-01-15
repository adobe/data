// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { mergePatch } from "./merge-patch.js";
import type { Patch } from "./merge-patch.js";

/**
 * RFC 7396 expectations:
 * - null replaces (or deletes when nested in an object)
 * - arrays replace wholesale (no deep merge)
 * - primitives replace
 * - objects merge recursively
 */

describe("mergePatch", () => {
    it("replaces top-level with null", () => {
        type T = { a: number; b: number };
        const target: T = { a: 1, b: 2 };
        const patch: Patch<T> = null;
        const result = mergePatch(target, patch);
        expect(result).toBeNull();
    });

    it("replaces primitives", () => {
        expect(mergePatch<number>(1, 2)).toBe(2);
        expect(mergePatch<string>("a", "b")).toBe("b");
        expect(mergePatch<boolean>(true, false)).toBe(false);
    });

    it("replaces arrays wholesale", () => {
        type T = { items: number[] };
        const target: T = { items: [1, 2, 3] };
        const patch: Patch<T> = { items: [9] };
        const result = mergePatch(target, patch);
        expect(result).toEqual({ items: [9] });
    });

    it("deletes object members when value is null", () => {
        type T = { a: number; b?: number };
        const target: T = { a: 1, b: 2 };
        const patch: Patch<T> = { b: null };
        const result = mergePatch(target, patch);
        expect(result).toEqual({ a: 1 });
        // ensure non-mutating
        expect(target).toEqual({ a: 1, b: 2 });
    });

    it("recursively merges nested objects", () => {
        type T = { a: { x: number; y?: number }; b: number };
        const target: T = { a: { x: 1, y: 2 }, b: 5 };
        const patch: Patch<T> = { a: { y: 9 } };
        const result = mergePatch(target, patch);
        expect(result).toEqual({ a: { x: 1, y: 9 }, b: 5 });
    });

    it("replaces non-object targets when patch is object", () => {
        // Using explicit any generic to exercise runtime behavior intentionally outside typing constraints
        expect(mergePatch<any>(1, { a: 1 })).toEqual({ a: 1 });
        expect(mergePatch<any>([1, 2], { a: 1 })).toEqual({ a: 1 });
        expect(mergePatch<any>(null, { a: 1 })).toEqual({ a: 1 });
    });

    it("handles adding new keys", () => {
        type T = { a: number; b?: number };
        const target: T = { a: 1 };
        const patch: Patch<T> = { b: 2 };
        const result = mergePatch(target, patch);
        expect(result).toEqual({ a: 1, b: 2 });
    });

    it("handles nested null to delete deep key", () => {
        type T = { a: { x: number; y?: number }; b: number };
        const target: T = { a: { x: 1, y: 2 }, b: 3 };
        const patch: Patch<T> = { a: { y: null } };
        const result = mergePatch(target, patch);
        expect(result).toEqual({ a: { x: 1 }, b: 3 });
    });

    it("replaces array value with null to delete property", () => {
        type T = { a?: number[]; b: number };
        const target: T = { a: [1, 2, 3], b: 1 };
        const patch: Patch<T> = { a: null };
        const result = mergePatch(target, patch);
        expect(result).toEqual({ b: 1 });
    });

    it("replaces scalar with array and vice versa", () => {
        type T = { a: number | number[] };
        const t1: T = { a: 1 };
        const p1: Patch<T> = { a: [1, 2] };
        expect(mergePatch(t1, p1)).toEqual({ a: [1, 2] });

        const t2: T = { a: [1, 2] };
        const p2: Patch<T> = { a: 7 };
        expect(mergePatch(t2, p2)).toEqual({ a: 7 });
    });

    it("does not mutate input objects or arrays", () => {
        type T = { a: { x: number; y?: number }; arr: number[] };
        const target: T = { a: { x: 1 }, arr: [1, 2] };
        const patch: Patch<T> = { a: { y: 2 }, arr: [9] };
        const targetClone = JSON.parse(JSON.stringify(target));
        mergePatch({ ...target, a: { ...target.a }, arr: [...target.arr] }, patch);
        expect(target).toEqual(targetClone);
    });

    it("merging empty object returns structural copy of target (no-op)", () => {
        type T = { a: number; b: { x: number } };
        const target: T = { a: 1, b: { x: 2 } };
        const patch: Patch<T> = {};
        const result = mergePatch(target, patch);
        expect(result).toEqual(target);
        // not the same reference when patching an object
        expect(result).not.toBe(target);
    });

    it("merges when target has undefined keys (treats as normal values)", () => {
        type T = { a?: number; b?: number };
        const target: T = { a: undefined };
        const patch: Patch<T> = { a: 1, b: undefined };
        const result = mergePatch(target, patch);
        expect(result).toEqual({ a: 1, b: undefined });
    });
});
