// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../../schema/index.js";
import { createCoerceFunction } from "../../../schema/create-coerce-function.js";
import { equals } from "../../../equals.js";
import { coerceStoreComponent } from "../../store/index.js";
import type { Store } from "../../store/index.js";
import type { VersionSchemas } from "./fold-schemas.js";

/**
 * Bring `store` to the given target schemas, IN PLACE:
 *   - a component/resource whose stored schema already matches is skipped;
 *   - one that differs is auto-converted (add-field-from-default, widen/narrow,
 *     reorder, clamp, …) — resources convert the same way, being singletons;
 *   - one absent from the store is added (a component is declared; a resource is
 *     materialized as a singleton at its default, with its accessor).
 *
 * Used to stage a document store to an intermediate version before a major
 * handler and to normalize it to the current schema. A change that is NOT
 * auto-convertible throws — it must have been produced by a handler before this
 * point, so reaching here un-handled is a developer error.
 */
export function conformStoreToSchemas(store: Store<any, any, any>, target: VersionSchemas): void {
    const absentComponents: Record<string, Schema> = {};
    const absentResources: Record<string, Schema> = {};
    coerceExisting(store, target.components, absentComponents);
    coerceExisting(store, target.resources, absentResources);
    if (Object.keys(absentComponents).length > 0 || Object.keys(absentResources).length > 0) {
        // Add what a document predating these lacks, so the store (and any handler)
        // sees the full target world. `extend` declares new components and
        // materializes new resource singletons at their defaults.
        store.extend({ components: absentComponents, resources: absentResources, archetypes: {} });
    }
}

function coerceExisting(
    store: Store<any, any, any>,
    schemas: Readonly<Record<string, Schema>>,
    absentOut: Record<string, Schema>,
): void {
    const stored = store.componentSchemas as Record<string, Schema>;
    for (const name of Object.keys(schemas)) {
        const to = schemas[name]!;
        const from = stored[name];
        if (from === undefined) {
            absentOut[name] = to;
            continue;
        }
        if (equals(from, to)) continue;
        if (createCoerceFunction(from, to) === null) {
            throw new Error(
                `Cannot conform "${name}" from its stored schema to the target: the change is not automatically ` +
                `convertible, so a version upgrade handler must produce the target shape before this point.`,
            );
        }
        coerceStoreComponent(store, name, to);
    }
}
