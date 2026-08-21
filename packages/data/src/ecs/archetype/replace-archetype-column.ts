// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { TypedBuffer } from "../../typed-buffer/index.js";
import type { Archetype } from "./archetype.js";

/**
 * Swap one column of `archetype` for `buffer` IN PLACE, preserving rows.
 *
 * An archetype bakes its column references into a specialized `insert`, so the
 * swap goes through `archetype.fromData`, which replaces the columns AND rebuilds
 * that baked insert — later inserts then write through the new column. `buffer`
 * must be sized to the archetype's `rowCapacity`.
 */
export function replaceArchetypeColumn(
    archetype: Archetype<any>,
    component: string,
    buffer: TypedBuffer<unknown>,
): void {
    const columns = archetype.columns as Record<string, TypedBuffer<unknown>>;
    archetype.fromData({
        columns: { ...columns, [component]: buffer },
        rowCount: archetype.rowCount,
        rowCapacity: archetype.rowCapacity,
    });
}
