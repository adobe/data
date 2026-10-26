// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { blockShift, chunkShift } from "./kernel.js";
import { forEachNewerRow, forEachPassingRange, type Filter } from "./ranges.js";

const rows = 5000;

/** A filter over `rows` rows at tick 1, with `changed` rows at tick 9, their chunks and blocks raised. */
const filterOf = (changed: readonly number[]): { readonly ticks: Float64Array; readonly chunks: Float64Array; readonly blocks: Float64Array } => {
    const ticks = new Float64Array(rows).fill(1);
    const chunks = new Float64Array((rows >> chunkShift) + 1).fill(1);
    const blocks = new Float64Array(chunks.length << (chunkShift - blockShift)).fill(1);
    for (const row of changed) {
        ticks[row] = chunks[row >> chunkShift] = blocks[row >> blockShift] = 9;
    }
    return { ticks, chunks, blocks };
};

const ranges = (filters: readonly Filter[], lastRun: number, start = 0, end = rows): (readonly [number, number])[] => {
    const found: (readonly [number, number])[] = [];
    forEachPassingRange(filters, lastRun, start, end, (first, last) => found.push([first, last]));
    return found;
};

describe("forEachPassingRange", () => {
    it("gives each maximal run of rows with a newer tick, across blocks and chunks", () => {
        const filter = filterOf([3, 4, 5, 63, 64, 1023, 1024, 4999]);
        expect(ranges([filter], 5)).toEqual([[3, 6], [63, 65], [1023, 1025], [4999, 5000]]);
        expect(ranges([filter], 5, 4, 1024)).toEqual([[4, 6], [63, 65], [1023, 1024]]);
        expect(ranges([filter], 9)).toEqual([]);
    });

    it("skips a chunk or a block whose tick isn't newer without reading its rows", () => {
        const filter = filterOf([2000]);
        filter.ticks[2100] = 9;
        filter.ticks[3100] = 9;
        // Row 2100's block and row 3100's chunk say nothing in them changed.
        expect(ranges([filter], 5)).toEqual([[2000, 2001]]);
    });

    it("passes a row any of several filters passes", () => {
        const first = filterOf([10, 3000]);
        const second = filterOf([11, 4000]);
        expect(ranges([first, second], 5)).toEqual([[10, 12], [3000, 3001], [4000, 4001]]);
        expect(ranges([first, second], 5, 11, 3001)).toEqual([[11, 12], [3000, 3001]]);
    });

    it("passes every row with no filters or a lastRun below 0", () => {
        const filter = filterOf([]);
        expect(ranges([], 5, 7, 70)).toEqual([[7, 70]]);
        expect(ranges([filter], -1, 7, 70)).toEqual([[7, 70]]);
    });
});

describe("forEachNewerRow", () => {
    it("gives each row with a newer tick, skipping chunks and blocks whose tick isn't", () => {
        const { ticks, chunks, blocks } = filterOf([0, 64, 1500, 4999]);
        ticks[1600] = 9;
        const found: number[] = [];
        forEachNewerRow(ticks, chunks, blocks, rows, 5, row => found.push(row));
        expect(found).toEqual([0, 64, 1500, 4999]);
        found.length = 0;
        forEachNewerRow(ticks, chunks, blocks, 1501, 5, row => found.push(row));
        expect(found).toEqual([0, 64, 1500]);
    });
});
