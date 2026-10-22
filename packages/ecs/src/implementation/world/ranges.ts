// © 2026 Adobe. MIT License. See /LICENSE for details.
import { chunkShift } from './kernel.js';

/** One `added` or `changed` filter: per-row ticks, and the newest tick of each chunk of rows. */
export type Filter = { readonly ticks: Float64Array; readonly chunks: Float64Array };

/**
 * Calls `call` for each maximal range of rows in `start` to `end` that passes the change filters: any tick newer
 * than `lastRun`. Chunks with no newer tick are skipped without reading their rows. With no filters, or `lastRun`
 * below 0, every row passes.
 */
export const forEachPassingRange = (filters: readonly Filter[], lastRun: number, start: number, end: number, call: (start: number, end: number) => void): void => {
    if (lastRun < 0 || filters.length === 0) return call(start, end);
    let first = -1;
    const single = filters.length === 1 ? filters[0].ticks : null;
    for (let chunk = start >> chunkShift, last = (end - 1) >> chunkShift; chunk <= last; chunk++) {
        const chunkStart = Math.max(start, chunk << chunkShift);
        const chunkEnd = Math.min(end, (chunk + 1) << chunkShift);
        let candidate = false;
        for (let i = 0; i < filters.length && !candidate; i++) candidate = filters[i].chunks[chunk] > lastRun;
        if (!candidate) {
            if (first >= 0) {
                call(first, chunkStart);
                first = -1;
            }
            continue;
        }
        for (let row = chunkStart; row < chunkEnd; row++) {
            let passes: boolean;
            if (single !== null) passes = single[row] > lastRun;
            else {
                passes = false;
                for (let i = 0; i < filters.length && !passes; i++) passes = filters[i].ticks[row] > lastRun;
            }
            if (passes) {
                if (first < 0) first = row;
            }
            else if (first >= 0) {
                call(first, row);
                first = -1;
            }
        }
    }
    if (first >= 0) call(first, end);
};
