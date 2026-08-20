// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import { createTypedBuffer, TypedBuffer } from "../../typed-buffer/index.js";
import type { Archetype } from "./archetype.js";
import { replaceArchetypeColumn } from "./replace-archetype-column.js";

/**
 * Rebuild one component column of `archetype` at `targetSchema` IN PLACE, mapping
 * each live row's value through `remap`. Returns `false` (a no-op) when the
 * component is absent.
 *
 * This is the MANUAL sibling of `coerceArchetypeColumn`: use it for a change that
 * is not automatically convertible (a type change, an enum-value remap, a
 * rename's data move), where you supply the old→new value function yourself.
 *
 * `remap`'s second argument is the archetype-local ROW index (not a stable entity
 * id) — use it only for per-row bookkeeping, not as an entity reference.
 */
export function remapArchetypeColumn(
    archetype: Archetype<any>,
    component: string,
    targetSchema: Schema,
    remap: (oldValue: any, index: number) => unknown,
): boolean {
    const columns = archetype.columns as Record<string, TypedBuffer<unknown>>;
    const existing = columns[component];
    if (existing === undefined) return false;
    const target = createTypedBuffer(targetSchema, archetype.rowCapacity);
    for (let i = 0; i < archetype.rowCount; i++) {
        target.set(i, remap(existing.get(i), i));
    }
    replaceArchetypeColumn(archetype, component, target);
    return true;
}
