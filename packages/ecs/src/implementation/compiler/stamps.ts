// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Statement } from './ir.js';
import { resolve } from './out.js';

const exits = (statement: Statement): boolean => {
    switch (statement.kind) {
        case "next": return true;
        case "if": return resolve(statement.consequent).some(exits) || resolve(statement.alternate).some(exits);
        case "block": case "loop": return resolve(statement.body).some(exits);
        default: return false;
    }
};

/** A chunk column stamped once per call: its block column, and the presence column the call's stamp depends on, if any. */
export type PerCall = { readonly blocks: number; readonly when: number | null };

/**
 * Chunk columns stamped on every row, with their block columns: by a top-level stamp that no earlier `next` can skip,
 * or one in a test of an optional component's presence, the same for every row of a call. Every row in
 * `[start, end)` runs the body, so these chunks and blocks can be stamped once per call instead of per row.
 */
export const unconditionalChunks = (rows: readonly Statement[], when: number | null = null, chunks = new Map<number, PerCall>()): ReadonlyMap<number, PerCall> => {
    for (const statement of rows) {
        if (exits(statement)) break;
        if (statement.kind === "stamp" && !(chunks.get(statement.chunks)?.when === null)) chunks.set(statement.chunks, { blocks: statement.blocks, when });
        if (statement.kind === "if" && when === null && statement.test.kind === "present") unconditionalChunks(resolve(statement.consequent), statement.test.column, chunks);
    }
    return chunks;
};
