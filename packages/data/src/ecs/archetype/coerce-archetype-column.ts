// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import { TypedBuffer, convertTypedBuffer } from "../../typed-buffer/index.js";
import type { Archetype } from "./archetype.js";

/**
 * Convert one component column of `archetype` to `targetSchema` IN PLACE,
 * preserving the archetype's live rows. Returns `false` (a no-op) when the
 * component is absent from this archetype.
 *
 * An archetype (a table) bakes its column references into a specialized `insert`;
 * swapping a column therefore goes through `archetype.fromData`, which replaces
 * the columns AND rebuilds that baked insert so later inserts write through the
 * converted column. Only the live `rowCount` rows are converted — unused capacity
 * stays at the new column's default.
 *
 * Throws (via {@link convertTypedBuffer}) if no automatic conversion exists.
 */
export function coerceArchetypeColumn(
    archetype: Archetype<any>,
    component: string,
    targetSchema: Schema,
): boolean {
    const columns = archetype.columns as Record<string, TypedBuffer<unknown>>;
    const existing = columns[component];
    if (existing === undefined) return false;
    const converted = convertTypedBuffer({ source: existing, targetSchema, capacity: archetype.rowCapacity, count: archetype.rowCount });
    archetype.fromData({
        columns: { ...columns, [component]: converted },
        rowCount: archetype.rowCount,
        rowCapacity: archetype.rowCapacity,
    });
    return true;
}
