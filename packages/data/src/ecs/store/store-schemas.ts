// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import { RESERVED_COMPONENT_NAMES } from "../required-components.js";

export type StoreSchemas = {
    readonly components: Record<string, Schema>;
    readonly resources: Record<string, Schema>;
};

const reserved = new Set(RESERVED_COMPONENT_NAMES);

/**
 * A schema in the "session" quadrant — neither persistent NOR shared
 * (`nonPersistent && nonShared`). Session state is transient and local (GPU
 * buffers, live drag offsets, …); it never persists and never replicates, so
 * versioning ignores it entirely — it is filtered out of the current schema and
 * rejected from a version history.
 */
export function isSessionSchema(schema: Schema): boolean {
    return schema.nonPersistent === true && schema.nonShared === true;
}

// Structural view of the store bits this reads — avoids the generic-method
// variance that blocks assigning a concrete store to `ReadonlyStore<any,…>`.
interface SchemaCarryingStore {
    readonly componentSchemas: object;
    readonly resources: object;
}

/**
 * Split a store's VERSIONED declared schemas into `components` and `resources`,
 * excluding the built-ins (`id`, `nonPersistent`, `nonShared`) and the session
 * quadrant ({@link isSessionSchema} — neither persistent nor shared). Everything
 * that is persistent OR shared is kept. Resources are singleton components
 * internally, so this separates them back out by name. Use it to feed the current
 * schema to {@link assertVersionsMatchSchema} — e.g.
 * `assertVersionsMatchSchema({ entries, ...storeSchemas(db), … })`.
 */
export function storeSchemas(store: SchemaCarryingStore): StoreSchemas {
    const all = store.componentSchemas as Record<string, Schema>;
    const resourceNames = new Set(Object.keys(store.resources as Record<string, unknown>));
    const components: Record<string, Schema> = {};
    const resources: Record<string, Schema> = {};
    for (const name of Object.keys(all)) {
        if (reserved.has(name)) continue;
        if (isSessionSchema(all[name]!)) continue; // session quadrant → not versioned
        if (resourceNames.has(name)) resources[name] = all[name]!;
        else components[name] = all[name]!;
    }
    return { components, resources };
}
