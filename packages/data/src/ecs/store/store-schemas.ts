// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "../../schema/index.js";
import { RESERVED_COMPONENT_NAMES } from "../required-components.js";

export type StoreSchemas = {
    readonly components: Record<string, Schema>;
    readonly resources: Record<string, Schema>;
};

const reserved = new Set(RESERVED_COMPONENT_NAMES);

/**
 * A non-persistent schema (`nonPersistent === true`). The version table exists to
 * upgrade PERSISTED blobs on load, so non-persistent state — the session quadrant
 * (also nonShared) AND the shared-transient quadrant — is never versioned: there
 * is no saved blob to migrate. (Shared-transient shape agreement between live
 * peers is a co-edit COMPATIBILITY concern, a separate axis, not an upgrade one.)
 * It is filtered out of the current schema and rejected from a version history.
 */
export function isTransientSchema(schema: Schema): boolean {
    return schema.nonPersistent === true;
}

/** The four quadrants of state, by (persistent?, shared?). */
export type Quadrant = "document" | "settings" | "shared-transient" | "session";

/**
 * Which quadrant a schema belongs to, from its `nonPersistent`/`nonShared` flags:
 * `document` (persistent+shared), `settings` (persistent+nonShared),
 * `shared-transient` (nonPersistent+shared), `session` (nonPersistent+nonShared).
 * Only the two PERSISTED quadrants are versioned.
 */
export function quadrantOf(schema: Schema): Quadrant {
    const persistent = schema.nonPersistent !== true;
    const shared = schema.nonShared !== true;
    return persistent ? (shared ? "document" : "settings") : shared ? "shared-transient" : "session";
}

// Structural view of the store bits this reads — avoids the generic-method
// variance that blocks assigning a concrete store to `ReadonlyStore<any,…>`.
interface SchemaCarryingStore {
    readonly componentSchemas: object;
    readonly resources: object;
}

/**
 * Split a store's VERSIONED declared schemas into `components` and `resources` —
 * the PERSISTED ones, excluding the built-ins (`id`, `nonPersistent`, `nonShared`)
 * and anything {@link isTransientSchema} (never saved → nothing to upgrade).
 * Resources are singleton components internally, so this separates them back out
 * by name. Use it to feed the current schema to {@link assertVersionsMatchSchema} —
 * e.g. `assertVersionsMatchSchema({ entries, ...storeSchemas(db), … })`.
 */
export function storeSchemas(store: SchemaCarryingStore): StoreSchemas {
    const all = store.componentSchemas as Record<string, Schema>;
    const resourceNames = new Set(Object.keys(store.resources as Record<string, unknown>));
    const components: Record<string, Schema> = {};
    const resources: Record<string, Schema> = {};
    for (const name of Object.keys(all)) {
        if (reserved.has(name)) continue;
        if (isTransientSchema(all[name]!)) continue; // non-persistent → not versioned
        if (resourceNames.has(name)) resources[name] = all[name]!;
        else components[name] = all[name]!;
    }
    return { components, resources };
}
