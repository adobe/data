// © 2026 Adobe. MIT License. See /LICENSE for details.
import { lineWords } from './protocol.js';

// What the world's thread and a joined thread share to run a tail (threads.md, "Tails"): a block per tail system, of
// three lines of words, and the snapshot the world copies its reads into when a writer is ready before it finished.
//
// A tail's work is numbered: position 0 is its head, which checks its conditions and resolves its resources, and
// positions from 1 are the rows of its matched archetypes in order. The tail claims positions in chunks by adding to
// its progress word; the world adds `snapshotted` to that word once it copied the passing rows from the position it
// read, so a claim that returns `snapshotted` or more reads the rest from the copy, and the word still says whether a
// claim came before the copy.

/** The positions the tail claimed, which it adds to and the world exchanges; and the end of its work, 1 plus its rows. */
export const progressWord = 0;
export const endWord = 1;
/** The position the tail finished reading through, which it stores after each chunk; whether the world waits for it. */
export const doneWord = lineWords;
export const waitingWord = lineWords + 1;
/** The snapshot: its offset, rows, the position it starts from, and its head's flags (`ranFlag`, `executedFlag`). */
export const snapshotOffsetWord = 2 * lineWords;
export const snapshotRowsWord = 2 * lineWords + 1;
export const snapshotStartWord = 2 * lineWords + 2;
export const snapshotFlagsWord = 2 * lineWords + 3;
/** Where the resource entity was as of the tail's sync, for its objects there: its archetype and row. */
export const snapshotResourceArchetypeWord = 2 * lineWords + 4;
export const snapshotResourceRowWord = 2 * lineWords + 5;
/** The rows the snapshot is laid out for, at least its rows. */
export const snapshotCapacityWord = 2 * lineWords + 6;
export const tailBlockWords = 3 * lineWords;
export const tailBlockBytes = tailBlockWords * 4;

/**
 * What the world adds to the progress word once it copied the rest, `snapshotted` itself when no claim came first:
 * claims add to it and stay past it.
 */
export const snapshotted = 0x40000000;
/** Positions a claim takes: the most the world waits for once a writer is ready. */
export const tailChunk = 64;

/** The snapshot's head flags: its conditions held, and it ran its rows or its body. */
export const headExecuted = 1;
export const headRan = 2;

const align = (bytes: number): number => (bytes + 7) & ~7;

/**
 * Where a snapshot of `rows` rows keeps each column, past its offset, each on 8 bytes: every row's position,
 * archetype and row (u32), entity (f64), then each linear component read of `strides` bytes, then each linear resource
 * read's value of `resourceStrides` bytes; and its bytes in all.
 */
export type SnapshotLayout = {
    readonly positions: number;
    readonly archetypes: number;
    readonly rows: number;
    readonly entities: number;
    readonly columns: readonly number[];
    readonly resources: readonly number[];
    readonly bytes: number;
};

export const snapshotLayout = (rows: number, strides: readonly number[], resourceStrides: readonly number[]): SnapshotLayout => {
    const words = align(4 * rows);
    const positions = 0;
    const archetypes = words;
    const rowsAt = 2 * words;
    const entities = 3 * words;
    let at = entities + 8 * rows;
    const columns: number[] = [];
    for (const stride of strides) {
        columns.push(at);
        at += align(stride * rows);
    }
    const resources: number[] = [];
    for (const stride of resourceStrides) {
        resources.push(at);
        at += align(stride);
    }
    return { positions, archetypes, rows: rowsAt, entities, columns, resources, bytes: Math.max(at, 8) };
};
