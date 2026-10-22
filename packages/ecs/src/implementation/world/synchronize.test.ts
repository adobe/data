// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { createBlock, endBlock, generationOf, indexOf, reserve, reserveFrom } from "./entities.js";
import { createState } from "./state.js";
import { synchronize } from "./synchronize.js";

/** The indexes on the free list. */
const freeIndexes = (state: ReturnType<typeof createState>): readonly number[] => [...state.entities.free.subarray(0, state.entities.cursor[1])];

describe("synchronize", () => {
    it("releases a reserved index whose spawn never arrived, so it isn't lost", () => {
        const state = createState();
        const orphan = reserve(state.entities);
        synchronize(state);
        const next = reserve(state.entities);
        expect(indexOf(next)).toBe(indexOf(orphan));
        expect(next).not.toBe(orphan);
    });

    it("returns the positions a block left unused to the free list once each, keeping their generations", () => {
        const state = createState();
        const block = createBlock(state.entities);
        const orphan = reserveFrom(block);
        endBlock(block, state.unused);
        expect(state.unused).toEqual([1, 8]);
        synchronize(state);
        const free = freeIndexes(state);
        // The orphan was handed out, so the leak scan releases it with a new generation; the rest were never handed out.
        expect(free).toHaveLength(8);
        expect(new Set(free).size).toBe(8);
        expect(free).toContain(indexOf(orphan));
        const next = createBlock(state.entities);
        const entities = Array.from({ length: 8 }, () => reserveFrom(next));
        expect(new Set(entities.map(indexOf)).size).toBe(8);
        expect(entities.filter(entity => generationOf(entity) !== 0).map(indexOf)).toEqual([indexOf(orphan)]);
    });

    it("maps unused positions past the free list to new indexes", () => {
        const state = createState();
        // Two indexes on the free list, then a first block of 8 takes them and 6 new ones.
        reserve(state.entities);
        reserve(state.entities);
        synchronize(state);
        expect(freeIndexes(state)).toHaveLength(2);
        const block = createBlock(state.entities);
        const used = [reserveFrom(block), reserveFrom(block), reserveFrom(block)];
        endBlock(block, state.unused);
        synchronize(state);
        const free = freeIndexes(state);
        expect(free).toHaveLength(8);
        expect(new Set(free).size).toBe(8);
        for (const entity of used) expect(free).toContain(indexOf(entity));
        expect(Math.max(...free)).toBe(state.entities.length - 1);
    });
});
