// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import { RESERVED_COMPONENT_NAMES } from "../required-components.js";

export type StoreSchemas = {
    readonly components: Record<string, Schema>;
    readonly resources: Record<string, Schema>;
};

const reserved = new Set(RESERVED_COMPONENT_NAMES);

// Structural view of the store bits this reads — avoids the generic-method
// variance that blocks assigning a concrete store to `ReadonlyStore<any,…>`.
interface SchemaCarryingStore {
    readonly componentSchemas: object;
    readonly resources: object;
}

/**
 * Split a store's declared schemas into `components` and `resources`, excluding
 * the built-ins (`id`, `nonPersistent`, `nonShared`). Resources are singleton
 * components internally, so this separates them back out by name. Use it to feed
 * the current schema to {@link assertVersionsMatchSchema} — e.g.
 * `assertVersionsMatchSchema({ entries, ...storeSchemas(db.store), … })`.
 */
export function storeSchemas(store: SchemaCarryingStore): StoreSchemas {
    const all = store.componentSchemas as Record<string, Schema>;
    const resourceNames = new Set(Object.keys(store.resources as Record<string, unknown>));
    const components: Record<string, Schema> = {};
    const resources: Record<string, Schema> = {};
    for (const name of Object.keys(all)) {
        if (reserved.has(name)) continue;
        if (resourceNames.has(name)) resources[name] = all[name]!;
        else components[name] = all[name]!;
    }
    return { components, resources };
}
