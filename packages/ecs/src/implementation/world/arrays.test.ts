// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { allocateArray, growArray } from "./arrays.js";
import { createMemory } from "./memory.js";

describe("arena arrays", () => {
    it("views stay valid and distinct across memory growth", () => {
        const memory = createMemory();
        const small = allocateArray(memory, Float64Array, 4);
        small.set([1, 2, 3, 4]);
        const large = allocateArray(memory, Float32Array, 1 << 20);
        large[large.length - 1] = 5;
        const grown = growArray(memory, small, Float64Array, 1 << 18, 4);
        expect([...grown.subarray(0, 4)]).toEqual([1, 2, 3, 4]);
        expect(large[large.length - 1]).toBe(5);
        expect(memory.memory.buffer.byteLength).toBeGreaterThanOrEqual(large.byteOffset + large.byteLength);
    });

    it("reuses a freed block of the same size class", () => {
        const memory = createMemory();
        const first = allocateArray(memory, Uint32Array, 100);
        growArray(memory, first, Uint32Array, 200, 100);
        expect(allocateArray(memory, Uint32Array, 120).byteOffset).toBe(first.byteOffset);
    });
});
