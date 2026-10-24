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
 * or by stamps all in tests of one optional component's presence, the same for every row of a call. Every row in
 * `[start, end)` runs the body, so these chunks and blocks can be stamped once per call instead of per row. A chunk
 * stamped under tests of different components is left to its stamps per row, since no one test covers it.
 */
export const unconditionalChunks = (rows: readonly Statement[]): ReadonlyMap<number, PerCall> => {
    const chunks = new Map<number, PerCall>();
    const mixed = new Set<number>();
    const visit = (statements: readonly Statement[], when: number | null): void => {
        for (const statement of statements) {
            if (exits(statement)) break;
            if (statement.kind === "stamp") {
                const found = chunks.get(statement.chunks);
                if (when === null) {
                    chunks.set(statement.chunks, { blocks: statement.blocks, when });
                    mixed.delete(statement.chunks);
                }
                else if (found === undefined && !mixed.has(statement.chunks)) chunks.set(statement.chunks, { blocks: statement.blocks, when });
                else if (found !== undefined && found.when !== null && found.when !== when) {
                    chunks.delete(statement.chunks);
                    mixed.add(statement.chunks);
                }
            }
            if (statement.kind === "if" && when === null && statement.test.kind === "present") visit(resolve(statement.consequent), statement.test.column);
        }
    };
    visit(rows, null);
    return chunks;
};
