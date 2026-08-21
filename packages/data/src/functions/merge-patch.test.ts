// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { mergePatch } from "./merge-patch.js";

/**
 * mergePatch semantics:
 * - objects merge recursively; a key set to the `deleteSentinel` is deleted.
 * - arrays replace wholesale (no deep merge); primitives replace.
 * - `deleteSentinel` defaults to `undefined`, so `null` is an ordinary value.
 *   Pass `null` for strict RFC 7396 (where `null` deletes).
 */
describe("mergePatch (default: undefined deletes, null is a value)", () => {
    it("recursively merges nested objects", () => {
        type T = { a: { x: number; y?: number }; b: number };
        const result = mergePatch<T>({ a: { x: 1, y: 2 }, b: 5 }, { a: { y: 9 } });
        expect(result).toEqual({ a: { x: 1, y: 9 }, b: 5 });
    });

    it("adds new keys", () => {
        const result = mergePatch<{ a: number; b?: number }>({ a: 1 }, { b: 2 });
        expect(result).toEqual({ a: 1, b: 2 });
    });

    it("deletes a key set to undefined; keeps null as a value", () => {
        expect(mergePatch<{ a?: number; b?: number }>({ a: 1, b: 2 }, { b: undefined })).toEqual({ a: 1 });
        expect(mergePatch<{ a: number | null }>({ a: 1 }, { a: null })).toEqual({ a: null });
    });

    it("deletes a nested key set to undefined", () => {
        const target: { a: Record<string, number> } = { a: { x: 1, y: 2 } };
        expect(mergePatch(target, { a: { y: undefined } })).toEqual({ a: { x: 1 } });
    });

    it("replaces arrays wholesale and replaces primitives", () => {
        expect(mergePatch<{ items: number[] }>({ items: [1, 2, 3] }, { items: [9] })).toEqual({ items: [9] });
        expect(mergePatch<number>(1, 2)).toBe(2);
        expect(mergePatch<string>("a", "b")).toBe("b");
    });

    it("replaces a non-object target when the patch is an object", () => {
        expect(mergePatch<any>(1, { a: 1 })).toEqual({ a: 1 });
        expect(mergePatch<any>(null, { a: 1 })).toEqual({ a: 1 });
    });

    it("does not mutate the target", () => {
        const target: { a: { x: number; y?: number } } = { a: { x: 1 } };
        const result = mergePatch(target, { a: { y: 2 } });
        expect(result).not.toBe(target);
        expect(target).toEqual({ a: { x: 1 } });
    });
});

// The null sentinel isn't encoded in `Patch<T>` (deletion is a runtime concern),
// so these opt-in RFC cases use `<any>` to pass `null` where the value type forbids it.
describe("mergePatch with a null delete sentinel (RFC 7396)", () => {
    it("deletes a key set to null; keeps undefined-valued keys", () => {
        expect(mergePatch<any>({ a: 1, b: 2 }, { b: null }, null)).toEqual({ a: 1 });
        // With the null sentinel, an undefined-valued key is a normal (undefined) value.
        expect(mergePatch<any>({ a: 1 }, { a: undefined }, null)).toEqual({ a: undefined });
    });

    it("deletes a nested key set to null", () => {
        expect(mergePatch<any>({ a: { x: 1, y: 2 } }, { a: { y: null } }, null)).toEqual({ a: { x: 1 } });
    });
});
