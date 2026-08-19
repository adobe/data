// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import type { Archetype, ReadonlyArchetype } from "../archetype/index.js";
import { coerceArchetypeColumn } from "../archetype/index.js";

// The minimal store surface this helper needs. Declared structurally (with `any`
// in the query signature) so a concretely-typed store assigns without the
// generic-method variance that blocks assignment to `ReadonlyStore<any,…>`.
interface CoercibleStore {
    queryArchetypes(include: readonly any[], options?: any): readonly ReadonlyArchetype<any>[];
    readonly componentSchemas: object;
}

/**
 * Change a component's schema across the whole store IN PLACE: convert that
 * component's column in every archetype that carries it, then adopt
 * `targetSchema` as the component's declared schema so subsequently-created
 * archetypes back it the new way.
 *
 * This is the store-level counterpart to {@link coerceArchetypeColumn}, and the
 * building block for migrating a persisted schema forward without a full reload.
 * Throws if any archetype's column has no automatic conversion to `targetSchema`.
 */
export function coerceStoreComponent(
    store: CoercibleStore,
    component: string,
    targetSchema: Schema,
): void {
    // queryArchetypes returns ReadonlyArchetype, but these are the live Archetype
    // instances that carry the fromData/insert surface the column swap needs.
    for (const archetype of store.queryArchetypes([component])) {
        coerceArchetypeColumn(archetype as unknown as Archetype<any>, component, targetSchema);
    }
    (store.componentSchemas as Record<string, Schema>)[component] = targetSchema;
}
