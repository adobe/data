// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import type { Archetype, ReadonlyArchetype } from "../archetype/index.js";
import { remapArchetypeColumn } from "../archetype/index.js";

// Minimal store surface (see coerce-store-component for why it is structural).
interface RemappableStore {
    queryArchetypes(include: readonly any[], options?: any): readonly ReadonlyArchetype<any>[];
    readonly componentSchemas: object;
}

/**
 * Change a component's schema across the whole store IN PLACE by mapping every
 * value through `remap`, then adopt `targetSchema` as the component's schema.
 *
 * This is the tool a MAJOR version handler reaches for: a change too structural
 * for automatic conversion (a number → object, an enum-value rename, splitting or
 * moving a field). For an auto-convertible change use {@link coerceStoreComponent}
 * instead — it needs no value function.
 */
export function remapStoreComponent<From = any, To = unknown>(
    store: RemappableStore,
    component: string,
    targetSchema: Schema,
    remap: (oldValue: From, index: number) => To,
): void {
    for (const archetype of store.queryArchetypes([component])) {
        remapArchetypeColumn(archetype as unknown as Archetype<any>, component, targetSchema, remap as (o: any, i: number) => unknown);
    }
    (store.componentSchemas as Record<string, Schema>)[component] = targetSchema;
}
