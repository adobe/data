// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import { TypedBuffer, convertTypedBuffer } from "../../typed-buffer/index.js";
import type { Archetype } from "./archetype.js";
import { replaceArchetypeColumn } from "./replace-archetype-column.js";

/**
 * Convert one component column of `archetype` to `targetSchema` IN PLACE,
 * preserving the archetype's live rows. Returns `false` (a no-op) when the
 * component is absent from this archetype. Only the live `rowCount` rows are
 * converted; unused capacity stays at the new column's default.
 *
 * This is the AUTOMATIC path — throws (via {@link convertTypedBuffer}) if no
 * automatic conversion exists. For a change that is not auto-convertible, use
 * `remapArchetypeColumn` with an explicit value mapper.
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
    replaceArchetypeColumn(archetype, component, converted);
    return true;
}
