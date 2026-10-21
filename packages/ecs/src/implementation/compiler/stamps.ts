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

/**
 * Chunk columns stamped on every row: by a top-level stamp that no earlier `next` can skip. Every row in
 * `[start, end)` runs the body, so these chunks can be stamped once per call instead of per row.
 */
export const unconditionalChunks = (rows: readonly Statement[]): ReadonlySet<number> => {
    const chunks = new Set<number>();
    for (const statement of rows) {
        if (exits(statement)) break;
        if (statement.kind === "stamp") chunks.add(statement.chunks);
    }
    return chunks;
};
