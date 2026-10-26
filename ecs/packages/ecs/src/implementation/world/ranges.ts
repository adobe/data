// © 2026 Adobe. MIT License. See /LICENSE for details.
import { blockShift, chunkShift } from './kernel.js';

/**
 * One `added` or `changed` filter: per-row ticks, the newest tick of each chunk of rows, and the newest tick of each
 * block of rows within a chunk.
 */
export type Filter = { readonly ticks: Float64Array; readonly chunks: Float64Array; readonly blocks: Float64Array };

/** Whether any filter's chunk tick of `chunk` is newer than `lastRun`. */
const chunkNewer = (filters: readonly Filter[], chunk: number, lastRun: number): boolean => {
    for (let i = 0; i < filters.length; i++) if (filters[i].chunks[chunk] > lastRun) return true;
    return false;
};

const blockNewer = (filters: readonly Filter[], block: number, lastRun: number): boolean => {
    for (let i = 0; i < filters.length; i++) if (filters[i].blocks[block] > lastRun) return true;
    return false;
};

const rowNewer = (filters: readonly Filter[], row: number, lastRun: number): boolean => {
    for (let i = 0; i < filters.length; i++) if (filters[i].ticks[row] > lastRun) return true;
    return false;
};

/**
 * Calls `each` with every row below `count` whose tick in `ticks` is newer than `since`, skipping chunks, then blocks,
 * whose ticks aren't.
 */
export const forEachNewerRow = (ticks: Float64Array, chunks: Float64Array, blocks: Float64Array, count: number, since: number, each: (row: number) => void): void => {
    for (let chunk = 0, last = (count - 1) >> chunkShift; chunk <= last; chunk++) {
        if (!(chunks[chunk] > since)) continue;
        for (let block = chunk << (chunkShift - blockShift), end = Math.min((chunk + 1) << (chunkShift - blockShift), ((count - 1) >> blockShift) + 1); block < end; block++) {
            if (!(blocks[block] > since)) continue;
            for (let row = block << blockShift, rowEnd = Math.min(count, (block + 1) << blockShift); row < rowEnd; row++) if (ticks[row] > since) each(row);
        }
    }
};

/** `forEachPassingRange` for one filter, whose loops each read one array. */
const forEachPassingRangeOf = (filter: Filter, lastRun: number, start: number, end: number, call: (start: number, end: number) => void): void => {
    const { ticks, chunks, blocks } = filter;
    const lastChunk = (end - 1) >> chunkShift;
    let row = start;
    while (row < end) {
        let chunk = row >> chunkShift;
        if (!(chunks[chunk] > lastRun)) {
            do chunk++; while (chunk <= lastChunk && !(chunks[chunk] > lastRun));
            if (chunk > lastChunk) return;
            row = chunk << chunkShift;
        }
        const chunkEnd = Math.min(end, (chunk + 1) << chunkShift);
        const lastBlock = (chunkEnd - 1) >> blockShift;
        let block = row >> blockShift;
        if (!(blocks[block] > lastRun)) {
            do block++; while (block <= lastBlock && !(blocks[block] > lastRun));
            if (block > lastBlock) {
                row = chunkEnd;
                continue;
            }
            row = block << blockShift;
        }
        const blockEnd = Math.min(chunkEnd, (block + 1) << blockShift);
        while (row < blockEnd && !(ticks[row] > lastRun)) row++;
        if (row === blockEnd) continue;
        // A passing range runs on by row ticks alone, past blocks and chunks, until a row doesn't pass.
        const first = row;
        do row++; while (row < end && ticks[row] > lastRun);
        call(first, row);
    }
};

/**
 * Calls `call` for each maximal range of rows in `start` to `end` that passes the change filters: any tick newer
 * than `lastRun`. Chunks, then blocks, with no newer tick are skipped without reading their rows, so finding the rows
 * costs a check per chunk, one per block of a chunk that changed, and one per row of a block that changed. With no
 * filters, or `lastRun` below 0, every row passes.
 */
export const forEachPassingRange = (filters: readonly Filter[], lastRun: number, start: number, end: number, call: (start: number, end: number) => void): void => {
    if (lastRun < 0 || filters.length === 0) return call(start, end);
    if (start >= end) return;
    if (filters.length === 1) return forEachPassingRangeOf(filters[0], lastRun, start, end, call);
    const lastChunk = (end - 1) >> chunkShift;
    let row = start;
    while (row < end) {
        let chunk = row >> chunkShift;
        if (!chunkNewer(filters, chunk, lastRun)) {
            do chunk++; while (chunk <= lastChunk && !chunkNewer(filters, chunk, lastRun));
            if (chunk > lastChunk) return;
            row = chunk << chunkShift;
        }
        const chunkEnd = Math.min(end, (chunk + 1) << chunkShift);
        const lastBlock = (chunkEnd - 1) >> blockShift;
        let block = row >> blockShift;
        if (!blockNewer(filters, block, lastRun)) {
            do block++; while (block <= lastBlock && !blockNewer(filters, block, lastRun));
            if (block > lastBlock) {
                row = chunkEnd;
                continue;
            }
            row = block << blockShift;
        }
        const blockEnd = Math.min(chunkEnd, (block + 1) << blockShift);
        while (row < blockEnd && !rowNewer(filters, row, lastRun)) row++;
        if (row === blockEnd) continue;
        const first = row;
        do row++; while (row < end && rowNewer(filters, row, lastRun));
        call(first, row);
    }
};
